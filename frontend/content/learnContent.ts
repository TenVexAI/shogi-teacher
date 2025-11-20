// Learn to Play Shogi - Content Structure
// Easy to edit and expand

export interface ContentSection {
  id: string;
  title: string;
  content: string;
  subsections?: ContentSection[];
}

export const learnContent: ContentSection[] = [
  {
    id: 'intro',
    title: 'Introduction to Shogi',
    content: `
# Welcome to Shogi!

Shogi (将棋), also known as Japanese Chess, is a two-player strategy board game that has been played in Japan for centuries. Often called "the game of generals," Shogi is one of the most popular board games in Japan.

## What Makes Shogi Unique?

Unlike Western chess, captured pieces in Shogi can be returned to the board under the capturing player's control. This "drop rule" creates dynamic gameplay where material advantage is temporary and comebacks are always possible.

## The Goal

The objective is to checkmate your opponent's King (玉/王). A King is in checkmate when it is under attack and cannot escape capture on the next move.
    `
  },
  {
    id: 'board-setup',
    title: 'The Board and Setup',
    content: `
# The Shogi Board

## Board Layout

The Shogi board is a 9x9 grid, making it slightly larger than a chess board. Columns are numbered 9 to 1 from left to right, and rows are lettered 'a' to 'i' from top to bottom.

## Promotion Zone

The last three rows on each side of the board form the **promotion zone**. When certain pieces enter, move within, or leave this zone, they can be promoted to become more powerful.

## Initial Setup

Each player starts with 20 pieces arranged in three rows:
- **Back row**: Lance, Knight, Silver, Gold, King, Gold, Silver, Knight, Lance
- **Second row**: Bishop (left) and Rook (right)
- **Third row**: Nine Pawns

All pieces point toward the opponent, with Black (先手/sente) moving first.
    `
  },
  {
    id: 'pieces',
    title: 'The Pieces',
    content: `
# Understanding the Pieces

Each piece in Shogi has unique movement patterns. Let's explore each one:
    `,
    subsections: [
      {
        id: 'king',
        title: 'King (玉/王)',
        content: `
## King (玉/王 - Gyoku/Ō)

**Movement**: One square in any direction (orthogonal or diagonal)

The King is the most important piece. Protecting your King while threatening your opponent's King is the essence of Shogi strategy.

**Cannot promote**
        `
      },
      {
        id: 'rook',
        title: 'Rook (飛)',
        content: `
## Rook (飛 - Hisha, "Flying Chariot")

**Movement**: Any number of squares orthogonally (forward, backward, left, right)

The Rook is one of the two major pieces and is extremely powerful.

**Promoted form**: Dragon King (龍 - Ryū)
- Moves like a Rook PLUS one square diagonally
- One of the most powerful pieces in the game
        `
      },
      {
        id: 'bishop',
        title: 'Bishop (角)',
        content: `
## Bishop (角 - Kaku, "Angle Mover")

**Movement**: Any number of squares diagonally

The Bishop is the other major piece, complementing the Rook's orthogonal movement.

**Promoted form**: Dragon Horse (馬 - Uma)
- Moves like a Bishop PLUS one square orthogonally
- Extremely versatile and powerful
        `
      },
      {
        id: 'gold',
        title: 'Gold General (金)',
        content: `
## Gold General (金 - Kin)

**Movement**: One square orthogonally OR one square diagonally forward

The Gold is a strong defensive piece that stays close to the King.

**Cannot promote** - Already at full strength!
        `
      },
      {
        id: 'silver',
        title: 'Silver General (銀)',
        content: `
## Silver General (銀 - Gin)

**Movement**: One square diagonally OR one square directly forward

The Silver is more offensive than the Gold, pushing forward into enemy territory.

**Promoted form**: Promoted Silver (全 - Narigin)
- Moves exactly like a Gold General
        `
      },
      {
        id: 'knight',
        title: 'Knight (桂)',
        content: `
## Knight (桂 - Kei)

**Movement**: Jumps two squares forward and one square to either side (like an "L" shape, but only forward)

The Knight is the only piece that can jump over other pieces. It's unique in that it can only move forward.

**Promoted form**: Promoted Knight (圭 - Narikei)
- Moves like a Gold General
- **Must promote** when reaching the last two rows (cannot move otherwise)
        `
      },
      {
        id: 'lance',
        title: 'Lance (香)',
        content: `
## Lance (香 - Kyō, "Incense")

**Movement**: Any number of squares directly forward

The Lance is like a forward-only Rook, excellent for attacking along files.

**Promoted form**: Promoted Lance (杏 - Narikyō)
- Moves like a Gold General
- **Must promote** when reaching the last row (cannot move otherwise)
        `
      },
      {
        id: 'pawn',
        title: 'Pawn (歩)',
        content: `
## Pawn (歩 - Fu, "Foot Soldier")

**Movement**: One square directly forward

Each player starts with nine Pawns. Unlike chess, Shogi Pawns capture the same way they move.

**Promoted form**: Tokin (と - Tokin)
- Moves like a Gold General
- **Must promote** when reaching the last row (cannot move otherwise)

**Special Rule**: You cannot have two unpromoted Pawns in the same file (column).
        `
      }
    ]
  },
  {
    id: 'rules',
    title: 'Rules and Gameplay',
    content: `
# How to Play

## Basic Rules

1. **Turn Order**: Black (先手/sente) moves first, then players alternate turns
2. **Movement**: Move one piece per turn according to its movement pattern
3. **Capture**: Move your piece to a square occupied by an opponent's piece to capture it
4. **Drops**: Captured pieces can be dropped back onto the board as your own pieces

## The Drop Rule

This is what makes Shogi unique! When you capture an opponent's piece:
- It becomes yours and goes into your "hand"
- On your turn, instead of moving a piece, you can **drop** a captured piece onto any empty square
- Dropped pieces are always unpromoted, even if they were promoted when captured
- You cannot drop a piece to give immediate checkmate (except with certain pieces)
- Pawns cannot be dropped on a file where you already have an unpromoted Pawn

## Promotion

When a piece enters, moves within, or leaves the promotion zone (last 3 rows):
- You may choose to promote it (flip it over)
- Some pieces **must** promote if they cannot move from their destination square
- Promoted pieces gain new movement abilities
- Gold Generals and Kings cannot promote

## Check and Checkmate

- **Check**: When a King is under attack
- **Checkmate**: When a King is in check and cannot escape
- You cannot make a move that leaves your own King in check
- The game ends when one player achieves checkmate

## Other Ways to Win

- **Resignation**: A player may resign if they believe their position is hopeless
- **Repetition**: If the same position occurs four times with the same player to move, the game is a draw (rare)
    `
  },
  {
    id: 'strategy',
    title: 'Basic Strategy',
    content: `
# Strategy Tips for Beginners

## Opening Principles

1. **Develop your pieces**: Move your Rook, Bishop, and Generals into active positions
2. **Protect your King**: Build a defensive castle (囲い/kakoi) around your King
3. **Control the center**: Central squares give your pieces more mobility
4. **Don't move the same piece twice** in the opening unless necessary

## Common Castles

**Mino Castle (美濃囲い)**: A popular defensive formation
- Moves the King to the side and protects it with Generals
- Strong against side attacks

**Yagura Castle (矢倉)**: A solid but slow formation
- Takes many moves to build
- Very strong against frontal attacks

## Middle Game Tips

1. **Exchange pieces when ahead**: Simplify the position if you have an advantage
2. **Use drops effectively**: Dropped pieces can create immediate threats
3. **Watch for forks**: Attack two pieces at once
4. **Keep pieces coordinated**: Pieces work better together

## Endgame Principles

1. **Activate your King**: In the endgame, the King becomes a fighting piece
2. **Use your pieces in hand**: Drops become more powerful in simplified positions
3. **Look for mating patterns**: Learn common checkmate sequences
4. **Don't rush**: Take time to calculate forcing sequences

## Common Mistakes to Avoid

- Leaving your King exposed
- Dropping pieces without purpose
- Ignoring your opponent's threats
- Moving pieces aimlessly
- Forgetting about the drop rule
    `
  },
  {
    id: 'history',
    title: 'History and Culture',
    content: `
# The History of Shogi

## Ancient Origins

Shogi evolved from the Indian game Chaturanga, which also gave rise to chess. It came to Japan via China and Korea around the 8th century.

## Evolution

- **Heian Period (794-1185)**: Early forms of Shogi appear in Japanese literature
- **Edo Period (1603-1868)**: Shogi becomes standardized in its modern form
- **Modern Era**: Shogi becomes a professional sport with title matches and rankings

## Professional Shogi

Today, Shogi is a major professional sport in Japan:
- The Japan Shogi Association oversees professional play
- Top players compete for prestigious titles like Meijin (名人) and Ryūō (竜王)
- Professional players are ranked from 4-dan to 9-dan
- Major title matches are broadcast and followed by millions

## Cultural Significance

Shogi is deeply embedded in Japanese culture:
- Taught in schools as a way to develop strategic thinking
- Featured in manga, anime, and literature
- Used as a metaphor for strategy and life
- Played in dedicated Shogi parlors across Japan

## Notable Players

- **Yoshiharu Habu**: One of the greatest players ever, achieved all seven major titles simultaneously
- **Sota Fujii**: Young prodigy who became the youngest professional and has broken numerous records
- **Akira Watanabe**: Multiple-time champion known for his aggressive style

## Shogi vs Chess

While both games share a common ancestor, they have evolved differently:
- **Drops**: Shogi's defining feature, absent in chess
- **Board size**: Shogi's 9x9 vs chess's 8x8
- **Piece movement**: Different patterns and promotion rules
- **Game length**: Shogi games tend to be longer and more complex
- **Draws**: Much rarer in Shogi due to the drop rule
    `
  },
  {
    id: 'notation',
    title: 'Reading Shogi Notation',
    content: `
# Shogi Notation

## Japanese Notation

Traditional Japanese notation uses:
- Numbers 1-9 for columns (right to left)
- Japanese numbers for rows (top to bottom)
- Kanji for pieces

Example: ☗7六歩 means "Black moves Pawn to 7-6"

## Western Notation (USI)

The Universal Shogi Interface (USI) format is used internationally:
- Columns: 9-1 (left to right)
- Rows: a-i (top to bottom)
- Pieces: Uppercase for Black, lowercase for White

Example: 7g7f means "move from 7g to 7f"

## Special Symbols

- **+**: Promotion (e.g., 7g7f+ means move and promote)
- **\\***: Drop (e.g., P\\*5e means drop a Pawn on 5e)
- **☗**: Black's move
- **☖**: White's move

## Reading Game Records

Professional games are recorded move-by-move, allowing players to study and replay them. This is an excellent way to improve your understanding of strategy and tactics.
    `
  },
  {
    id: 'resources',
    title: 'Learning Resources',
    content: `
# Continue Your Shogi Journey

## Online Resources

**Websites**:
- 81Dojo: Online Shogi server with players worldwide
- Shogi.cz: Comprehensive English-language Shogi resource
- Shogi Harbour: Tutorials and problem sets

**YouTube Channels**:
- Hidetchi: Excellent English tutorials
- HIDETCHI Shogi: Professional game commentary

## Books

**For Beginners**:
- "Shogi for Beginners" by John Fairbairn
- "The Art of Shogi" by Tony Hosking
- "Better Moves for Better Shogi" by Teruichi Aono

**For Intermediate Players**:
- "Joseki at a Glance" (opening theory)
- "Kakoi Attack and Defense" (castle strategies)

## Practice Tips

1. **Solve Tsume Shogi**: Checkmate puzzles that improve tactical vision
2. **Play regularly**: Online or with friends
3. **Review your games**: Learn from mistakes
4. **Study professional games**: See how masters handle positions
5. **Join a community**: Online forums and local clubs

## Using This App

This Shogi Teacher app is designed to help you learn:
- Play against the AI at various difficulty levels
- Get hints and explanations during games
- Analyze your moves with the built-in engine
- Practice at your own pace

Remember: Everyone starts as a beginner. With practice and study, you'll improve steadily. Enjoy the journey!
    `
  }
];
