Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""C:\Program Files\nodejs\node.exe"" ""C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"" run dev", 0, False
