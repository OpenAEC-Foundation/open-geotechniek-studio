# Public synthetic GEF fixtures

These data were authored for Open Geotechniek Studio on 2026-10-29 and are
licensed under the repository MIT license. They describe invented measurements
and a Dutch coordinate-system reference point, not customer investigations.

`synthetic-cpt.gef` follows CUR GEF-CPT-Report 1.1.2 and exercises independent
corrected-depth and penetration-length columns, qc/fs/Rf/u2, RD/NAP and explicit
column/record separators. Differential tests compare the shared importer with
Bedrock Engineer gef-parser 0.4.2 and pygef 0.14.1. Both external projects use
gef-file-to-map for tokenization; their interpretation paths are separate. This
comparison is compatibility evidence, not three independent numerical reviews.
