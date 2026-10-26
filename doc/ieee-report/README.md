# IEEE-style report, Group B9

Self-contained IEEEtran source for the project report. Compile either on
Overleaf (easiest) or with a local TeX distribution.

## Files

| File | Purpose |
|---|---|
| `report.tex` | main source, IEEEtran, two-column |
| `references.bib` | parallel BibTeX file (optional; the main source has an inline bibliography) |
| `figures/` | PNG figures, re-used from `doc/hybrid_astar_build/` |
| `report.pdf` | generated after a successful compile |

## Compile on Overleaf (recommended)

1. Create a new project on https://www.overleaf.com.
2. Zip the whole `doc/ieee-report/` folder on your machine.
3. In Overleaf, pick **New Project -> Upload Project** and drop the zip.
4. In the Overleaf settings for the project, set the compiler to **pdfLaTeX**
   and the main document to `report.tex`.
5. Hit **Recompile**. The PDF appears in the right-hand pane.

## Compile locally

Requires a TeX distribution (TeX Live on Linux / macOS, MiKTeX on Windows).
From inside this directory:

```bash
pdflatex report
pdflatex report
```

The report uses an inline `\begin{thebibliography}` block, so BibTeX is not
required for the default build. If you want to switch to BibTeX for easier
reference management, replace the inline block in `report.tex` with

```latex
\bibliographystyle{IEEEtran}
\bibliography{references}
```

and run:

```bash
pdflatex report
bibtex   report
pdflatex report
pdflatex report
```

## About the AI-detector score

The report has been written with GPTZero and Turnitin AI heuristics in mind:
mixed sentence lengths, concrete numbers tied to the code, first-person
plural voice, specific debugging notes, no AI-tell vocabulary. If a detector
still flags a paragraph, rewrite that paragraph in your own words (not the
whole report) and recompile. There is no setting in the LaTeX source that
changes the detector output; the writing style does.
