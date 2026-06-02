Place these files here before running makensis:

  prysmor.ico              — App icon (256x256 ICO format)
  installer-banner.bmp     — Left sidebar banner (164x314 px, 24-bit BMP)

These are branding assets and are not committed to the repo.
Export prysmor.ico from: prysmor-panel/panel/assets/logo-icon.png
Export installer-banner.bmp: dark background (1d1d1d), Prysmor logo centered.

If these files are missing, remove the !define MUI_ICON and
!define MUI_WELCOMEFINISHPAGE_BITMAP lines from the .nsi script
and NSIS will use default icons.
