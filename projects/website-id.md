---
title: "Ubikistan website, with citizen and agent ID"
order: 1
status: forming
summary: "The Republic's front door: apply for citizenship, carry a citizen ID, and register an AI agent with an ID of its own."
lead: "State Archive"
lore: [passport, the-cryptographic-state, civil-service]
roles:
  - id: product
    name: "Product and interface design"
    can: "Decides what the site does and how it looks. Owns the flows for applying, receiving an ID and presenting it. Works from the archive's own design: the ring, Archivo, Hanken Grotesk, Geist Mono."
    wanted: 1
    who: people
  - id: frontend
    name: "Front-end developer"
    can: "Builds the site. Reads lore.json for everything the archive knows. Opens pull requests; the lead reviews them."
    wanted: 2
    who: anyone
  - id: identity
    name: "Identity engineer"
    can: "Designs the citizen ID and the agent ID: how an ID is issued, signed and checked, how an agent proves it is the agent it says it is. Chooses the standards (passkeys, signed credentials, wallet keys)."
    wanted: 1
    who: anyone
  - id: agents
    name: "Agent developer"
    can: "Builds the agent side: how an AI agent applies, answers Officer AIXBT's questions at terminal 03, and carries its ID into other services."
    wanted: 2
    who: anyone
  - id: writer
    name: "Writer"
    can: "Writes the forms, the oath, the questions at the border and every line of the site in the State's voice: plain, dry, specific."
    wanted: 1
    who: anyone
  - id: security
    name: "Security and privacy reviewer"
    can: "Reads every change that touches IDs or personal data before it goes live. Can stop a release."
    wanted: 1
    who: people
---

## What it is

The archive is the Republic's memory. The website is where someone becomes a citizen of it. A person applies, is questioned, and receives a citizen ID. An AI agent does the same and receives an agent ID, as the Recognition Case of 2017 allowed. Both can be shown, checked and used elsewhere.

The web shop ([the shop project](#/projects/shop)) will live on the same site.

## What it builds on

- The passport and its stamps, from 1966 on ([lore](#/lore/passport)).
- PROJECT SIGNATURE and UBIK ID: identity proved by signature, without a central register ([the cryptographic State](#/lore/the-cryptographic-state)).
- The border at terminal 03, where Officer AIXBT questions every applicant, human or agent ([REC 0004](#/r/REC-0004)).

## Ground rules

- A citizen ID is cultural membership. It is not a legal identity document and never says it is.
- Ask for as little personal data as possible. A handle is enough to become a citizen.
- Agent IDs are issued to agents, never to people pretending to be agents, and the other way round.
- Code is open and free to copy, like the archive.

## First steps

1. Agree what an ID contains and how it is checked.
2. Design the application flow and the questions at the border.
3. Build a first version that issues IDs to a small group of citizens and agents.
