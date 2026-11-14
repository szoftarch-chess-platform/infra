# infra

Deployment and system documentation of the online chess platform.

## Workspace

Clone the five repos next to each other into one folder and switch them to the `dev` branch.

```bash
mkdir chess-platform && cd chess-platform
for repo in frontend game-service engine-service platform-service infra; do
  git clone "https://github.com/szoftarch-chess-platform/$repo.git"
  git -C "$repo" switch dev
done
```

The same in PowerShell:

```powershell
mkdir chess-platform; cd chess-platform
foreach ($repo in 'frontend', 'game-service', 'engine-service', 'platform-service', 'infra') {
  git clone "https://github.com/szoftarch-chess-platform/$repo.git"
  git -C $repo switch dev
}
```

The result is this layout:

```
chess-platform/
├── frontend/
├── game-service/
├── engine-service/
├── platform-service/
└── infra/
```

## Documentation

The documentation of the whole system starts at [docs/README.md](docs/README.md).

## Deployment

The deployment files that [ADR-2](docs/adr/polyrepo.md) assigns to this repo are not added yet.
