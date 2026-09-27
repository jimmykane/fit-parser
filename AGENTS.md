# Agent Instructions

- Never install or add the official Garmin FIT SDK as a project dependency, development dependency, optional dependency,
  or vendored project code. Its license prevents its use as a dependency in fit-parser, sports-lib, and Quantified Self.
  When needed for investigation, run it only as a standalone tool outside those repositories and their dependency trees.
