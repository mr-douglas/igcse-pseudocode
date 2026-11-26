globalThis.PC.PY_TESTS = [
  {
    name: 'student style program',
    py: `# average of some marks
total = 0
count = int(input("How many marks? "))
for i in range(count):
    mark = float(input("Mark: "))
    total += mark
average = total / count
if average >= 50:
    print(f"Average {average} - pass")
elif average >= 40:
    print("Close: " + str(average))
else:
    print("Fail")`,
    pseudo: `// average of some marks
DECLARE Total : REAL
DECLARE Count : INTEGER
DECLARE i : INTEGER
DECLARE Mark : REAL
DECLARE Average : REAL

Total ← 0
OUTPUT "How many marks? "
INPUT Count
FOR i ← 0 TO Count - 1
    OUTPUT "Mark: "
    INPUT Mark
    Total ← Total + Mark
NEXT i
Average ← Total / Count
IF Average >= 50
  THEN
    OUTPUT "Average ", Average, " - pass"
  ELSE
    IF Average >= 40
      THEN
        OUTPUT "Close: ", Average
      ELSE
        OUTPUT "Fail"
    ENDIF
ENDIF`,
  },
  {
    name: 'functions, constants, while True and slicing',
    py: `MAX_TRIES = 3

def is_valid(code: str) -> bool:
    return len(code) == 4 and code[0:2].upper() == "AB"

def show(msg):
    print(msg)

tries = 0
while True:
    code = input()
    tries = tries + 1
    if is_valid(code) or tries == MAX_TRIES:
        break
show("Done")
print(code[2:4], tries // 2, tries % 2, 2 ** 3)`,
    pseudo: `CONSTANT MaxTries ← 3
DECLARE Tries : INTEGER
DECLARE Code : STRING

FUNCTION IsValid(Code : STRING) RETURNS BOOLEAN
    RETURN LENGTH(Code) = 4 AND UCASE(SUBSTRING(Code, 1, 2)) = "AB"
ENDFUNCTION

PROCEDURE Show(Msg : STRING)
    OUTPUT Msg
ENDPROCEDURE

Tries ← 0
REPEAT
    INPUT Code
    Tries ← Tries + 1
UNTIL IsValid(Code) OR Tries = MaxTries
CALL Show("Done")
OUTPUT SUBSTRING(Code, 3, 2), DIV(Tries, 2), MOD(Tries, 2), 2 ^ 3`,
  },
  {
    name: 'arrays and match',
    py: `scores = [0] * 10
names = ["Ann", "Bob"]
grid = [[0] * 3 for _ in range(3)]
grid[1][2] = 5
choice = input()
match choice:
    case "a":
        scores[0] = 1
    case _:
        print("?")`,
    pseudo: `DECLARE Scores : ARRAY[0:9] OF INTEGER
DECLARE Names : ARRAY[0:1] OF STRING
DECLARE Choice : STRING

Names[0] ← "Ann"
Names[1] ← "Bob"
DECLARE Grid : ARRAY[0:2, 0:2] OF INTEGER
Grid[1, 2] ← 5
INPUT Choice
CASE OF Choice
  "a" : Scores[0] ← 1
  OTHERWISE OUTPUT "?"
ENDCASE`,
  },
  {
    name: 'unsupported Python is flagged, not invented',
    py: `items = []
items.append(3)
for x in items:
    print(x)`,
    pseudo: `// NOT IN THE 0478 PSEUDOCODE: items = []
// NOT IN THE 0478 PSEUDOCODE: items.append(3)
// NOT IN THE 0478 PSEUDOCODE: for x in items:`,
  },
];
