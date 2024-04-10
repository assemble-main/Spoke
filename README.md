![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/politics-rewired/Spoke) ![CircleCI](https://img.shields.io/circleci/build/github/politics-rewired/Spoke)

# Spoke

Spoke is an open source text-distribution tool for organizations to mobilize supporters and members into action. Spoke allows you to upload phone numbers, customize scripts and assign volunteers to communicate with supporters while allowing organizations to manage the process.

Spoke was created by Saikat Chakrabarti and Sheena Pakanati, and is now maintained by MoveOn.org at https://github.com/MoveOnOrg/Spoke.

This repository is a branch of MoveOn/Spoke created by Politics Rewired, a small campaign tech consultancy created in 2019.

Due to a desire to develop more quickly, we did not maintain compatibility with MoveOn/Spoke, which means although this repository will be
a useful source of ideas, it may more work than is worth it to merge it back into MoveOn/Spoke, although we welcome any efforts towards
that goal. See [`HOWTO_migrate-from-moveon-main.md`](./docs/HOWTO_migrate-from-moveon-main.md).

## Getting Started

### Prerequisites

Runtimes and package managers:

- Node (^18.16) -- See [How to Install Node](https://nodejs.dev/learn/how-to-install-nodejs)
- Yarn (>= 1.19.1) -- See [Installing Yarn](https://classic.yarnpkg.com/en/docs/install)

External services:

- Postgres (>= 11) -- See [install](https://postgresql.org/download) and [start](https://www.postgresql.org/docs/current/server-start.html) documentation

Recommended:

- Docker, for running Postgres as a container
  - [install documentation](https://docs.docker.com/engine/install/)

### Setting up a development environment

#### Install Node and Yarn

We recommend using the [asdf version manager](https://github.com/asdf-vm/asdf).

```sh
# Example using `asdf` (https://github.com/asdf-vm/asdf)
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
asdf plugin add yarn https://github.com/twuni/asdf-yarn
asdf install
```

You can also install the prereqs manually:

- [Node install documentation](https://nodejs.dev/learn/how-to-install-nodejs)
- [Yarn install documentation](https://classic.yarnpkg.com/en/docs/install)

#### Install and run a Postgres server

If you have Docker installed, we recommend using Postgres as a container.

Spoke Rewired comes with a `postgres` container in `docker-compose.yml`, which you can start with the following command:

```sh
# Run in the foreground, so you can watch logs and stop with Ctrl-C
docker compose up postgres

# Run in the background so you can use the terminal for other things
docker compose up postgres -d

# (if you have an older version of Docker installed, you may have to run
# "docker-compose" with a hyphen instead of "docker compose" with a space)
```

The `postgres` container will automatically start up a server with the following configuration:

- connection string (for `DATABASE_URL`): `postgres://spoke:spoke@localhost:15432/spokedev`
- port: 15432
- default database: `spokedev`
- user: `spoke`
- password: `spoke`

To stop all containers, including Postgres, run:

```sh
docker compose down
```

To delete all container data, including the Postgres database, and stop all containers, run:

```sh
docker compose down -v
```

After the database container is taken down, you can run the `up` commands above to restart it. For more information, see [the Docker Compose reference documentation](https://docs.docker.com/compose/reference/).

You can also install and run a Postgres server manually without Docker:

- Postgres [Install](https://postgresql.org/download) and [start](https://www.postgresql.org/docs/current/server-start.html) documentation

#### Clone the repo

```sh
git clone git@github.com:politics-rewired/Spoke.git
cd Spoke
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

#### Install Node dependencies

```sh
yarn install
```

#### Copy the example environment

You will need to update the database connection
string: it should contain the correct host, port, and username/password
credentials to your development Postgres server.

```sh
cp .env.example .env
vi .env

# in this case, the server is running at port 5432 (the default Postgres port)
# DATABASE_URL=postgres://spoke:spoke@localhost:5432/spokedev
```

#### Create the `spokedev` database (if it doesn't yet exist)

```sh
psql -c "create database spokedev;"
```

#### Run the migrations

```sh
yarn migrate:worker
yarn knex migrate:latest
```

#### Run codegen

```sh
yarn codegen
```

#### Start the Spoke application in develpoment mode

```sh
yarn dev
```

### SMS

For development, you can set `DEFAULT_SERVICE=fakeservice` to skip using an SMS provider (Assemble Switchboard or Twilio) and insert the message directly into the database. This is set by default in `.env`.

To simulate receiving a reply from a contact you can use the Send Replies utility: `http://localhost:3000/admin/1/campaigns/1/send-replies`, updating the app and campaign IDs as necessary.

### Migrations

Spoke uses [`knex`](https://knexjs.org/) to manage application schema. Spoke also uses [`graphile-worker`](https://github.com/graphile/worker) as it's database-backed job queue.

**graphile-worker**

The `graphile-worker` migrations only need to be run once:

```sh
yarn migrate:worker
```

**knex**

The knex migrations need to be run any time a new release has made changes to the application schema, as indicated by a new migration file in `./migrations`. Some migrations require application downtime, some do not. It is up to YOU to review migration notes before rolling out a new release.

```sh
yarn knex migrate:latest
```

To create a new knex migration, run

```sh
yarn knex migrate:make my-migration
```

### Next Steps

All configuration environment variables are documented in [config.js](./src/config.js).

You can also find developer documentation and guides in the [docs](./docs) directory.

## Contributing

### Commit Messages

This project adheres to the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/). You can use `yarn commit` instead of `git commit`.

### Merging PRs

Pull Request merges should use the "Squash and merge" strategy. The final commit message should include relevant information from the component commits and its heading should reflect the purpose of the PR itself; if the PR adds a feature, it should be a `feat: add feature x` even if it includes a necessary bug fix (ideally unrelated bug fixes are submitted as separate PRs in the first place).

## Releases

Each release gets its own commit on `main` that includes the version bump and changelog updates. The version bump, changelog updates, commit, and tag are generated by [`standard-version`](https://github.com/conventional-changelog/standard-version):

```sh
yarn release
```

Other helpful options are:

```sh
# Preview the changes
yarn release --dry-run

# Specify the version manually
yarn release --release-as 1.5.0
# or the semver version type to bump
yarn release --release-as minor

# Specify an alpha release
yarn release --prerelease
# or the pre-release type
yarn release --prerelease alpha
```

## Building container images locally

If you plan to build container images locally for use in production you may want to set the default architecture by adding the following to your shell config (e.g. `~/.bash_profile`):

```sh
export DOCKER_DEFAULT_PLATFORM=linux/amd64
```

or pass `--platform=linux/amd64` to all `docker buildx` commands.

## Deploying

Spoke can be deployed in a variety of different ways. We use Kubernetes internally and are only currently maintaining the Docker image. See the [developer documentation](./docs) for more information about other deployment methods.

# License

See [LICENSE](./LICENSE).
