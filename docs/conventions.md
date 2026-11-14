# Conventions

These rules apply in every repo of the system.

## Branches and pull requests

- `main` is the production branch and the default branch on GitHub.
- `dev` is the integration branch.
- Work happens on feature branches that start from `dev` and get back into it through pull requests. The developers open and merge the pull requests. Claude does not open pull requests.

## Documentation

Every piece of information is written down in one place only, and other documents refer to that place instead of repeating it.

| Content | Place |
|---|---|
| documents of the whole system | the index in `infra/docs/README.md` |
| decisions with their reasons | ADRs, as the [ADR guide](adr-guide.md) describes |
| diagrams of a service | `docs/architecture.md` in the repo of the service, once it has components to show |
| open questions that no ADR covers, next steps | `docs/README.md` of the repo |
| how to build, run, configure and test a repo, and its file structure | `README.md` of the repo |

- A README gives instructions without reasons. The reasons are in the ADRs.
- A diagram shows only what the ADRs decided, and its caption names those ADRs.
- Inside a repo, documents refer to each other with relative links. Between repos only IDs are used, such as ADR-4, PS-ADR-2 or F-1, because a relative link into another repo does not work on GitHub.
- If a document contradicts an ADR, the document is fixed. If an ADR contradicts the specification, the team decides.

## Claude Code

- The `CLAUDE.md` of a repo only imports the documents that Claude needs in every session. These are the README and the `docs/README.md` of the repo, and the system index and these conventions from `infra/docs/`.
- The imports load when Claude Code starts, so every imported document stays short. In a service repo Claude Code asks for approval the first time, because two of the documents are outside the repo.
- The `.claude/settings.json` of every repo adds the sibling repos that it needs to `permissions.additionalDirectories`, so Claude can read them without asking. This takes effect once the folder is trusted.
- Claude builds only what has been explicitly decided, and it adds no libraries, endpoints or feature code based on assumptions.
- If something is an open question or conflicts with the specification or an ADR, Claude asks first.
- Before changing code in an area, Claude reads the ADRs that the indexes list for it. Before writing or changing an ADR, it reads the ADR guide.

## Configuration

- The services read their configuration from environment variables, which compose sets. A service can have its own configuration files on top of that.
- Required settings have no built-in default values. If one is missing, the service stops at startup with an error that names it.
- Secrets never go into a repo.

## Language and writing

- Everything under version control is in English, which includes code, comments, documentation, commit messages and pull requests.
- Text for people, such as documentation and comments, is written in plain sentences, with as few parentheses, dashes, semicolons and colons as possible, and without needless numbering.
