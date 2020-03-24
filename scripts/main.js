var board = null;
var chess = new Chess();
var $status = $('#status');
var $pgn = $('#pgn');

var whitePiecesHeatmap = ['#ccffcc', '#66ff66', '#00ff00', '#009900', '#003300']
var blackPiecesHeatmap = ['#ffad99', '#ff8566', '#ff5c33', '#ff3300', '#cc2900']
var tensionColor = '#ffff66'

function removeGrayCircles() {
  $('#myBoard .gray-circle').remove();
}

function grayCircle(square) {
  var $square = $('#myBoard .square-' + square)

  $square.append('<div class="gray-circle" />');
}

function onDragStart(source, piece, position, orientation) {
  // do not pick up pieces if the game is over
  if (chess.game_over()) return false;

  // only pick up pieces for the side to move
  if ((chess.turn() === 'w' && piece.search(/^b/) !== -1) ||
      (chess.turn() === 'b' && piece.search(/^w/) !== -1)) {
    return false;
  }
}

function onDragMove(newLocation, oldLocation, source,
                     piece, position, orientation) {
  var legalMoves = chess.moves({
    square: source,
    verbose: true
  });

  if (legalMoves.find((move) => { return move.to == newLocation })) {
    var hypotheticalChess = new Chess(chess.fen());
    var hypotheticalMove = hypotheticalChess.move({
      from: source,
      to: newLocation,
      promotion: 'q' // NOTE: always promote to a queen for simplicity
    })
    console.log("LOGGING HYPO MOVE!");
    console.log(hypotheticalMove);
    console.log("END LOGGING HYPO MOVE!");
    paintHeatmap(hypotheticalChess);
  }

  if (newLocation == source) {
    paintHeatmap(chess);
  }

  // console.log('New location: ' + newLocation)
  // console.log('Old location: ' + oldLocation)
  // console.log('Source: ' + source)
  // console.log('Piece: ' + piece)
  // console.log('Position: ' + Chessboard.objToFen(position))
  // console.log('Orientation: ' + orientation)
  // console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
}

function onMouseoverSquare(square, piece) {
  // get list of possible moves for this square
  var moves = chess.moves({
    square: square,
    verbose: true
  })

  // exit if there are no moves available for this square
  if (moves.length === 0) return

  // highlight the possible squares for this piece
  for (var i = 0; i < moves.length; i++) {
    grayCircle(moves[i].to)
  }
}

function onMouseoutSquare(square, piece) {
  removeGrayCircles()
}

function onDrop(source, target) {
  removeGrayCircles();

  // see if the move is legal
  var move = chess.move({
    from: source,
    to: target,
    promotion: 'q' // NOTE: always promote to a queen for simplicity
  })

  // illegal move
  if (move === null) return 'snapback';

  updateStatus();
  paintHeatmap(chess);
}

function onSnapEnd () {
  board.position(chess.fen())
}

function paintHeatmap(chess) {
  console.log(chess.turn());
  unpaintHeatmap()

  var attackedSquaresWhite = getAttackedSquares(chess, chess.WHITE);
  var attackedSquaresBlack = getAttackedSquares(chess, chess.BLACK);
  var defendedSquaresWhite = getDefendedSquares(chess, chess.WHITE);
  var defendedSquaresBlack = getDefendedSquares(chess, chess.BLACK);

  var targetedSquaresWhite = mergeFrequencyCounters(
      attackedSquaresWhite, defendedSquaresWhite)
  var targetedSquaresBlack = mergeFrequencyCounters(
      attackedSquaresBlack, defendedSquaresBlack)

  for (const square in targetedSquaresWhite) {
    numAttacksWhite = targetedSquaresWhite[square];
    var numAttacksBlack = 0;
    if (square in targetedSquaresBlack) {
      numAttacksBlack = targetedSquaresBlack[square];
    }
    numAttacks = numAttacksWhite - numAttacksBlack;
    if (numAttacks == 0) {
      if (numAttacksWhite >= 1 && chess.get(square) != null) {
        // this piece is in tension
        var $square = $('#myBoard .square-' + square);
        $square.css('background', tensionColor);
      }
    } else if (numAttacks >= 1) {
      var $square = $('#myBoard .square-' + square)
      var background = whitePiecesHeatmap[numAttacks - 1]
      $square.css('background', background)
    } else if (numAttacks <= -1) {
      // this is a black controlled square
      var $square = $('#myBoard .square-' + square)
      var background = blackPiecesHeatmap[0 - numAttacks - 1]
      $square.css('background', background)
    }
    delete targetedSquaresWhite[square];
    delete targetedSquaresBlack[square];
  }
  for (const square in targetedSquaresBlack) {
    numAttacksBlack = targetedSquaresBlack[square];
    var $square = $('#myBoard .square-' + square)
    var background = blackPiecesHeatmap[numAttacksBlack - 1]
    $square.css('background', background)
  }
}

function getAttackedSquares(chess, color) {
  // We can only determine moves for the color whose turn it is currently, so
  // we create a new gamestate for this color and use that to get the attacked
  // squares.
  var newFen = setTurnInFen(chess, color);
  var chessTmp = new Chess(newFen);

  console.log(newFen);

  // get all the squares attacked by this color
  var attackedSquares = {};
  for (var i = 0; i < chessTmp.SQUARES.length; i++) {
    var square = chessTmp.SQUARES[i];
    var piece = chessTmp.get(square);
    if (piece instanceof Object && piece.color == color) {
      if (piece.type == chess.PAWN) {
        // For pawns, the attacked squares are different from the SQUARES
        // they can move to, so we need to write a little custom code to
        // figure out which squares are being attacked.
        squaresAttackedByPawn =
            getSquaresAttackedByPawn(chess, square, piece.color);
        squaresAttackedByPawn.forEach(
            square => updateFrequencyCounter(square, attackedSquares));
      } else {
        // For all other pieces, the attacked squares are the same as the
        // possible moves.
        var moves = chessTmp.moves({ verbose: true, square: square });
        moves.forEach(
            move => updateFrequencyCounter(move.to, attackedSquares));
      }
    }
  }
  return attackedSquares;
}

function getSquaresAttackedByPawn(chess, square, color) {
  // TODO(cogan): calculate using the 0x88 board representation
  // TODO(cogan): change this to only include squares that don't
  // hit our own pieces, because those should count as defended squares
  squaresAttackedByPawn = []
  squareIndex = chess.SQUARES.indexOf(square);
  if (color == chess.WHITE) {
    if (squareIndex % 8 == 0) {
      // piece is on left edge of the board
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex - 7]);
    } else if ((squareIndex + 1) % 8 == 0) {
      // piece is on the right edge of the board
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex - 9]);
    } else {
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex - 7]);
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex - 9]);
    }
  } else {
    if (squareIndex % 8 == 0) {
      // piece is on left edge of the board
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex + 9]);
    } else if ((squareIndex + 1) % 8 == 0) {
      // piece is on the right edge of the board
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex + 7]);
    } else {
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex + 9]);
      squaresAttackedByPawn.push(chess.SQUARES[squareIndex + 7]);
    }
  }
  return squaresAttackedByPawn;
}

function getDefendedSquares(chess, color) {
  // We can only determine moves for the color whose turn it is currently, so
  // we create a new gamestate for this color and use that to get the attacked
  // squares.
  var newFen = setTurnInFen(chess, color);
  var chessTmp = new Chess(newFen);
  var board = chessTmp.board_0x88();

  // get all the squares attacked by this color
  var us = color;
  var them = chess.swap_color(us);
  var firstSq = chess.SQUARES_0x88.a8;
  var lastSq = chess.SQUARES_0x88.h1;

  var defendedSquares = {}

  for (var i = firstSq; i <= lastSq; i++) {
    /* did we run off the end of the board */
    if (i & 0x88) {
      i += 7;
      continue;
    }

    var piece = board[i];
    if (piece == null || piece.color !== us) {
      continue;
    }

    if (piece.type === chess.PAWN) {
      // TODO(cogan): calculate defended squares for pawns. Right now these
      // are calculated by the attacking squares function
    } else {
      var len = chess.PIECE_OFFSETS[piece.type].length;
      for (var j = 0; j < len; j++) {
        var offset = chess.PIECE_OFFSETS[piece.type][j]
        var square = i

        while (true) {
          square += offset
          if (square & 0x88) break

          if (board[square] != null && board[square].color === us) {
            updateFrequencyCounter(chess.algebraic(square), defendedSquares)
            break
          }

          /* break, if knight or king */
          if (piece.type === 'n' || piece.type === 'k') break
        }
      }
    }
  }
  return defendedSquares
}

function updateFrequencyCounter(value, freqCounter) {
  if (!(value in freqCounter)) {
    freqCounter[value] = 1;
  } else {
    freqCounter[value]++;
  }
}

function mergeFrequencyCounters(freqCounter1, freqCounter2) {
  mergedResult = {};
  for (let [key, value] of Object.entries(freqCounter1)) {
    mergedResult[key] = value;
  }
  for (let [key, value] of Object.entries(freqCounter2)) {
    if (!(value in mergedResult)) {
      mergedResult[key] = value;
    } else {
      mergedResult[key] += value;
    }
  }
  return mergedResult;
}

function setTurnInFen(chess, color) {
  var tokens = chess.fen().split(' ');
  tokens[1] = color;

  if (chess.turn() != color) {
    // Fix problems with En Passant. For example, if white just played e4,
    // then e3 in an En Passant target for black. However, if we change the
    // turn to white, that En Passant target is illegal and doesn't make sense.
    // So when we are manipulating turns, we should remove the En Passant
    // target from the fen string.
    tokens[3] = '-';
  }
  return tokens.join(' ');
}

function unpaintHeatmap() {
  $('#myBoard .square-55d63').css('background', '')
}

function updateStatus() {
  var status = ''

  var moveColor = 'White'
  if (chess.turn() === 'b') {
    moveColor = 'Black'
  }

  // checkmate?
  if (chess.in_checkmate()) {
    status = 'Game over, ' + moveColor + ' is in checkmate.'
  }

  // draw?
  else if (chess.in_draw()) {
    status = 'Game over, drawn position'
  }

  // game still on
  else {
    status = moveColor + ' to move'

    // check?
    if (chess.in_check()) {
      status += ', ' + moveColor + ' is in check'
    }
  }

  $status.html(status)
  $pgn.html(chess.pgn())
}

var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDragMove: onDragMove,
  onDrop: onDrop,
  onMouseoutSquare: onMouseoutSquare,
  onMouseoverSquare: onMouseoverSquare,
  onSnapEnd: onSnapEnd,
}
board = Chessboard('myBoard', config)

updateStatus();
paintHeatmap(chess);
