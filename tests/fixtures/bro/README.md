# BRO interoperability fixture

`bedrock-example.xml` is copied unchanged from Bedrock Engineer's
bro-xml-parser-ts, commit ed84e54, `test/fixtures/cpt/example.xml`.
Source: https://github.com/bedrock-engineer/bro-xml-parser-ts

It is a public BRO CPT dispatch, not supplied customer data. Distributed under
the upstream Apache-2.0 repository license; see
`licenses/bedrock-Apache-2.0.txt` and `THIRD-PARTY-NOTICES.txt`.

`coordinates.json` extracts numeric RD (EPSG:28992) / standardized ETRS89
(EPSG:4258) position pairs from the four public `test/fixtures/cpt/*.xml` files
at the same upstream commit. Each row records its source filename and BRO ID.
These regression pairs verify the existing map polynomial within 0.5 m; the
polynomial is explicitly not a survey-grade replacement for RDNAPTRANS.
