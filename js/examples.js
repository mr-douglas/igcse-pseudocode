// Example programs, based on the examples in the 0478 syllabus pseudocode guide.
(function (G) {
  'use strict';
  const PC = G.PC;
  PC.EXAMPLES = [
    {
      name: 'Variables, constants, input and output',
      stdin: '7\n', stdout: 'Enter the number of hours\nYou are owed 45.5\n',
      pseudo: `// Works out how much to pay
CONSTANT HourlyRate ← 6.50
DECLARE NumberOfHours : INTEGER
DECLARE TotalToPay : REAL

OUTPUT "Enter the number of hours"
INPUT NumberOfHours
TotalToPay ← NumberOfHours * HourlyRate
OUTPUT "You are owed ", TotalToPay`,
    },
    {
      name: 'Nested IF statements',
      stdin: '', stdout: 'Ali is champion and highest scorer\n',
      pseudo: `DECLARE ChallengerName : STRING
DECLARE ChampionName : STRING
DECLARE ChallengerScore : INTEGER
DECLARE ChampionScore : INTEGER
DECLARE HighestScore : INTEGER
ChallengerName ← "Ali"
ChampionName ← "Bo"
ChallengerScore ← 90
ChampionScore ← 80
HighestScore ← 85

IF ChallengerScore > ChampionScore
  THEN
    IF ChallengerScore > HighestScore
      THEN
        OUTPUT ChallengerName, " is champion and highest scorer"
      ELSE
        OUTPUT ChallengerName, " is the new champion"
    ENDIF
  ELSE
    OUTPUT ChampionName, " is still the champion"
    IF ChampionScore > HighestScore
      THEN
        OUTPUT ChampionName, " is also the highest scorer"
    ENDIF
ENDIF`,
    },
    {
      name: 'CASE statement',
      stdin: 'D\n', stdout: '51\n',
      pseudo: `DECLARE Move : STRING
DECLARE Position : INTEGER
Position ← 50
INPUT Move
CASE OF Move
  'W' : Position ← Position - 10
  'E' : Position ← Position + 10
  'A' : Position ← Position - 1
  'D' : Position ← Position + 1
  OTHERWISE OUTPUT "Beep"
ENDCASE
OUTPUT Position`,
    },
    {
      name: 'Nested FOR loops and a 2D array',
      stdin: '', stdout: 'Total for Row 1 is 55\nTotal for Row 2 is 110\nThe grand total is 165\n',
      pseudo: `CONSTANT MaxRow ← 2
DECLARE Amount : ARRAY[1:2, 1:10] OF INTEGER
DECLARE Total : INTEGER
DECLARE RowTotal : INTEGER
DECLARE Row : INTEGER
DECLARE Column : INTEGER

FOR Row ← 1 TO MaxRow
    FOR Column ← 1 TO 10
        Amount[Row, Column] ← Row * Column
    NEXT Column
NEXT Row

Total ← 0
FOR Row ← 1 TO MaxRow
    RowTotal ← 0
    FOR Column ← 1 TO 10
        RowTotal ← RowTotal + Amount[Row, Column]
    NEXT Column
    OUTPUT "Total for Row ", Row, " is ", RowTotal
    Total ← Total + RowTotal
NEXT Row
OUTPUT "The grand total is ", Total`,
    },
    {
      name: 'REPEAT and WHILE loops',
      stdin: 'abc\nSecret\n', stdout: 'Please enter the password\nPlease enter the password\n4\n',
      pseudo: `DECLARE Password : STRING
DECLARE Number : INTEGER

REPEAT
    OUTPUT "Please enter the password"
    INPUT Password
UNTIL Password = "Secret"

Number ← 40
WHILE Number > 9 DO
    Number ← Number - 9
ENDWHILE
OUTPUT Number`,
    },
    {
      name: 'Procedures',
      stdin: '', stdout: '-----\n------------------------------------------------------------\n',
      pseudo: `DECLARE MySize : INTEGER
CONSTANT Default ← 60

PROCEDURE DefaultLine
    CALL Line(60)
ENDPROCEDURE

PROCEDURE Line(Size : INTEGER)
    DECLARE Length : INTEGER
    DECLARE Dashes : STRING
    Dashes ← ""
    FOR Length ← 1 TO Size
        Dashes ← Dashes + "-"
    NEXT Length
    OUTPUT Dashes
ENDPROCEDURE

MySize ← 5
IF MySize = Default
  THEN
    CALL DefaultLine
  ELSE
    CALL Line(MySize)
ENDIF
CALL DefaultLine`,
    },
    {
      name: 'Functions',
      stdin: '', stdout: 'Sum of squares = 500\n',
      pseudo: `FUNCTION SumSquare(Number1 : INTEGER, Number2 : INTEGER) RETURNS INTEGER
    RETURN Number1 * Number1 + Number2 * Number2
ENDFUNCTION

OUTPUT "Sum of squares = ", SumSquare(10, 20)`,
    },
    {
      name: 'String operations, MOD, DIV, ROUND and RANDOM',
      stdin: '', stdout: '10\nw\nHAPPY\nHappy\n3\n1\n',
      pseudo: `DECLARE Value : INTEGER
OUTPUT LENGTH("Happy Days")
OUTPUT LCASE('W')
OUTPUT UCASE("Happy")
OUTPUT SUBSTRING("Happy Days", 1, 5)
OUTPUT DIV(10, 3)
OUTPUT MOD(10, 3)
Value ← ROUND(RANDOM() * 6, 0)  // a whole number from 0 to 6`,
    },
    {
      name: 'Linear search',
      stdin: 'Cat\n', stdout: 'Enter a name to find\nFound at position 3\n',
      pseudo: `DECLARE Names : ARRAY[1:5] OF STRING
DECLARE Index : INTEGER
DECLARE Found : BOOLEAN
DECLARE SearchName : STRING

Names[1] ← "Ali"
Names[2] ← "Ben"
Names[3] ← "Cat"
Names[4] ← "Dev"
Names[5] ← "Eve"
OUTPUT "Enter a name to find"
INPUT SearchName
Found ← FALSE
Index ← 1
WHILE Found = FALSE AND Index <= 5 DO
    IF Names[Index] = SearchName
      THEN
        Found ← TRUE
      ELSE
        Index ← Index + 1
    ENDIF
ENDWHILE
IF Found
  THEN
    OUTPUT "Found at position ", Index
  ELSE
    OUTPUT "Not found"
ENDIF`,
    },
    {
      name: 'Bubble sort',
      stdin: '', stdout: '3\n8\n15\n21\n42\n',
      pseudo: `DECLARE Numbers : ARRAY[1:5] OF INTEGER
DECLARE Top : INTEGER
DECLARE Swap : BOOLEAN
DECLARE Index : INTEGER
DECLARE Temp : INTEGER

Numbers[1] ← 42
Numbers[2] ← 8
Numbers[3] ← 21
Numbers[4] ← 3
Numbers[5] ← 15
Top ← 5
REPEAT
    Swap ← FALSE
    FOR Index ← 1 TO Top - 1
        IF Numbers[Index] > Numbers[Index + 1]
          THEN
            Temp ← Numbers[Index]
            Numbers[Index] ← Numbers[Index + 1]
            Numbers[Index + 1] ← Temp
            Swap ← TRUE
        ENDIF
    NEXT Index
    Top ← Top - 1
UNTIL NOT Swap OR Top = 1
FOR Index ← 1 TO 5
    OUTPUT Numbers[Index]
NEXT Index`,
    },
    {
      name: 'File handling',
      stdin: '', stdout: 'Hello from FileA\n',
      pseudo: `DECLARE LineOfText : STRING
OPENFILE "FileA.txt" FOR WRITE
WRITEFILE "FileA.txt", "Hello from FileA"
CLOSEFILE "FileA.txt"

OPENFILE "FileA.txt" FOR READ
OPENFILE "FileB.txt" FOR WRITE
READFILE "FileA.txt", LineOfText
WRITEFILE "FileB.txt", LineOfText
CLOSEFILE "FileA.txt"
CLOSEFILE "FileB.txt"
OUTPUT LineOfText`,
    },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
