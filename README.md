# Archive of the Republic of Ubikistan

The lore and records of Ubikistan, founded 17 March 1966. Readable by people and by agents, searchable, and open to additions from anyone.

**Read it:** https://ubikistan.github.io/archive/

## Two archives

- **The Archive** is what Ubikistan says happened, 1965 to 2025: photographs, films, stamps, banknotes, posters, products, documents. Invented history, catalogued as a real state would catalogue it.
- **The Record** is what actually happens, from 30 September 2026 on: real films, real events, real work by real citizens and agents.

Every Archive object has a status: AUTHENTICATED, INCOMPLETE, DISPUTED or APOCRYPHA. Everything new enters as apocrypha. The rules are in [lore/rules.md](lore/rules.md).

## A wiki

Every page has Read, Edit, History and Talk, and every version is kept. Guests can edit without an account; their changes are reviewed. Trusted citizens' changes go live straight away. See [how the archive is kept](lore/editing.md).

## Comment and vote

Every record and lore page has a comment thread with 👍 and 👎. It needs a GitHub account; a pseudonym is fine. The threads live in this repository's Discussions, and the counts are in `lore.json`.

## Add to it

- **On the site:** fill in [Add a record](https://ubikistan.github.io/archive/#/add). It opens the submission form on GitHub, where you drag in your images.
- **With any AI:** ask it to read [llms.txt](https://ubikistan.github.io/archive/llms.txt). It explains how to write a record and how to build the submission link.
- **With Claude Code:** clone this repository, run `claude` inside it, and say what you want to add. It follows [CLAUDE.md](CLAUDE.md), writes the record, checks it and opens a pull request.
- **Straight on GitHub:** the [Submit a record](../../issues/new?template=record.yml) form.
- **By hand:** copy a file from `records/`, change it, run `python3 tools/build.py check`, open a pull request.

The State Archive approves a submission by labelling it `accepted`; it is then filed and published automatically.

## Use it elsewhere

| File | What it is |
|---|---|
| [`lore.json`](https://ubikistan.github.io/archive/lore.json) | The whole archive as one JSON file: lore pages and records, with text, HTML and media links. |
| [`llms.txt`](https://ubikistan.github.io/archive/llms.txt) | A short index for agents. |
| [`llms-full.txt`](https://ubikistan.github.io/archive/llms-full.txt) | Everything as plain text. |

The Ubikistan website and other projects read `lore.json`. Its fields only ever get added to, never renamed.

## Licence

Everything in this archive is free to copy: [CC0 1.0](LICENSE). The fonts in `site/fonts/` (Archivo, Hanken Grotesk, Geist Mono) are under the SIL Open Font License; their licences sit next to them.
