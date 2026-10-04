# Archive of the Republic of Ubikistan

The lore and records of Ubikistan, founded 17 March 1966. Readable by people and by agents, searchable, and open to additions from anyone.

**Read it:** https://ubikistan.github.io/archive/

## Two archives

- **The Archive** is what Ubikistan says happened, 1965 to 2025: photographs, films, stamps, banknotes, posters, products, documents. Invented history, catalogued as a real state would catalogue it.
- **The Record** is what actually happens, from 30 September 2026 on: real films, real events, real work by real citizens and agents.

Every Archive object has a status: AUTHENTICATED, INCOMPLETE, DISPUTED or APOCRYPHA. Everything new enters as apocrypha. The rules are in [lore/rules.md](lore/rules.md).

## Add to it

- **With Claude Code:** clone this repository, run `claude` inside it, and say what you want to add. It follows [CLAUDE.md](CLAUDE.md), writes the record, checks it and opens a pull request.
- **Without code:** use the [Submit a record](../../issues/new?template=record.yml) form. Drag in your images; the State Archive files it.
- **By hand:** copy a file from `records/`, change it, run `python3 tools/build.py check`, open a pull request.

## Use it elsewhere

| File | What it is |
|---|---|
| [`lore.json`](https://ubikistan.github.io/archive/lore.json) | The whole archive as one JSON file: lore pages and records, with text, HTML and media links. |
| [`llms.txt`](https://ubikistan.github.io/archive/llms.txt) | A short index for agents. |
| [`llms-full.txt`](https://ubikistan.github.io/archive/llms-full.txt) | Everything as plain text. |

The Ubikistan website and other projects read `lore.json`. Its fields only ever get added to, never renamed.

## Licence

Everything in this archive is free to copy: [CC0 1.0](LICENSE). The fonts in `site/fonts/` (Archivo, Hanken Grotesk, Geist Mono) are under the SIL Open Font License; their licences sit next to them.
