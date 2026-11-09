; Notenblatt – custom NSIS include (electron-builder "nsis.include").
; Adds an uninstaller page with the checkbox
; "Alle gespeicherten Daten (Klassen, Noten) ebenfalls löschen" (unchecked by default).
; When checked, %APPDATA%\Notenblatt is removed. Never runs during silent updates.
;
; This file is included before MUI2 is loaded, so everything that uses MUI or
; nsDialogs lives inside macros, which electron-builder expands later.

!ifdef BUILD_UNINSTALLER

Var NbDeleteData
Var NbCheckbox

!macro customUnWelcomePage
  !include nsDialogs.nsh
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.NbDataPageCreate un.NbDataPageLeave

  Function un.NbDataPageCreate
    ; Pages are never shown for silent (update) runs.
    StrCpy $NbDeleteData ${BST_UNCHECKED}
    !insertmacro MUI_HEADER_TEXT "Gespeicherte Daten" "Sollen auch Ihre Klassen und Noten gelöscht werden?"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    SetShellVarContext current
    ${NSD_CreateLabel} 0 0 100% 40u "Notenblatt speichert Klassen, Schülernamen und Noten in Ihrem Benutzerprofil:$\r$\n$APPDATA\Notenblatt$\r$\n$\r$\nDiese Daten bleiben beim Deinstallieren erhalten, wenn Sie das Kästchen nicht ankreuzen."
    Pop $0
    ${NSD_CreateCheckbox} 0 50u 100% 12u "Alle gespeicherten Daten (Klassen, Noten) ebenfalls löschen"
    Pop $NbCheckbox
    ${NSD_SetState} $NbCheckbox ${BST_UNCHECKED}
    nsDialogs::Show
  FunctionEnd

  Function un.NbDataPageLeave
    ${NSD_GetState} $NbCheckbox $NbDeleteData
  FunctionEnd
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ${If} $NbDeleteData == ${BST_CHECKED}
      SetShellVarContext current
      DetailPrint "Lösche gespeicherte Daten: $APPDATA\Notenblatt"
      RMDir /r "$APPDATA\Notenblatt"
    ${EndIf}
  ${EndIf}
!macroend

!endif
