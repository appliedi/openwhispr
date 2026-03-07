!macro customUnInstall
  StrCpy $0 "$PROFILE\.cache\flowrytr\models"
  IfFileExists "$0\*.*" 0 +3
    RMDir /r "$0"
    DetailPrint "Removed flowrytr cached models"
  StrCpy $1 "$PROFILE\.cache\flowrytr"
  RMDir "$1"
!macroend
