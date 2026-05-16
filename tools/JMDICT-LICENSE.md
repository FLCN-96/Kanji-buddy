# JMdict attribution

`data/kanji-words.json` is derived from JMdict_e, the Japanese-English
dictionary file maintained by the Electronic Dictionary Research and
Development Group (EDRDG).

- Project: https://www.edrdg.org/jmdict/edict_doc.html
- License: Creative Commons Attribution-ShareAlike 4.0 International
  (CC-BY-SA-4.0) — https://creativecommons.org/licenses/by-sa/4.0/

Per the EDRDG licence:

> The files are the property of the Electronic Dictionary Research and
> Development Group at Monash University, and are used in conformance with
> the Group's licence.

The generator script that derives our dictionary is at
`tools/build-kanji-words.py`. The on-disk JMdict source is cached at
`tools/cache/JMdict_e.gz` (gitignored).

By including the derived dictionary, this project distributes data licensed
under CC-BY-SA-4.0. If you redistribute `data/kanji-words.json`, retain
this notice and a link to the EDRDG project.
