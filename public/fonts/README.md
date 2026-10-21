Fonts: DM Sans and Manrope. Source: Google Fonts (fonts.googleapis.com / fonts.gstatic.com). Both are distributed under the SIL Open Font License. The OFL text is included in OFL-DM-Sans.txt and OFL-Manrope.txt. Local files avoid requests to external font services at runtime.

PDF font assets terrace-report-regular.ttf and terrace-report-bold.ttf are static
400/700 instances of the existing dm-sans.woff2, renamed Terrace Report. They retain
the DM Sans copyright and OFL license (OFL-DM-Sans.txt). Regenerate with
scripts/prepare-report-fonts.py and the optional fonttools/brotli Python packages.
No remote font or PDF service is contacted when generating a report.
