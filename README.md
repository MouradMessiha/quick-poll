# Deno Poll Slack App

This app allows creating a poll in any public channel. It doesn't work properly
in private direct messages: In multi user direct messaging, the poll message
can't be updated. In single user direct messaging it can be updated but there is
not much use for a poll when there are only 2 users in the chat.

## Setup

Before getting started, make sure you have a development workspace where you
have permissions to install apps. If you don’t have one set up, go ahead and
[create one](https://slack.com/create). Also, please note that the workspace
requires any of [the Slack paid plans](https://slack.com/pricing).

### Install the Slack CLI

Install and configure the Slack CLI. Step-by-step instructions can be found in
[Quickstart Guide](https://api.slack.com/future/quickstart).

### Clone the Repository

Start by cloning this repository:

## Create a Link Trigger

[Triggers](https://api.slack.com/future/triggers) are what cause Workflows to
run.

A [Link Trigger](https://api.slack.com/future/triggers/link) is a type of
Trigger that generates a **Shortcut URL** which, when posted in a channel or
added as a bookmark, becomes a link. When clicked, the Link Trigger will run the
associated Workflow.

Link Triggers are _unique to each installed version of your app_. This means
that Shortcut URLs will be different across each workspace, as well as between
[locally run](#running-your-project-locally) and
[deployed apps](#deploying-your-app). When creating a Trigger, you must select
the Workspace that you'd like to create the Trigger in. Each Workspace has a
development version (denoted by `(dev)`), as well as a deployed version.

To create a Link Trigger for the Workflow, run the following command:

```zsh
$ slack trigger create --trigger-def triggers/poll_trigger.ts
```

After selecting a Workspace, the output provided will include the Link Trigger
Shortcut URL. Copy and paste this URL into a channel as a message, or add it as
a bookmark in a channel of the Workspace you selected.

**Note: this link won't run the Workflow until the app is either running locally
or deployed!** Read on to learn how to run your app locally and eventually
deploy it to Slack hosting.

## Running Your Project Locally

While building your app, you can see your changes propagated to your workspace
in real-time with `slack run`. In both the CLI and in Slack, you'll know an app
is the development version if the name has the string `(dev)` appended.

```zsh
# Run app locally
$ slack run

Connected, awaiting events
```

Once running, click the
[previously created Shortcut URL](#create-a-link-trigger) associated with the
`(dev)` version of your app. This should start the Workflow.

To stop running locally, press `<CTRL> + C` to end the process.

## Testing

Run all tests with `deno test`:

```zsh
$ deno test
```

## Linting

Run linting with `deno lint`:

```zsh
$ deno lint
```

## Formatting

Run formatting check with `deno fmt --check`:

```zsh
$ deno fmt --check
```

## Deploying Your App

Once you're done with development, you can deploy the production version of your
app to Slack hosting using `slack deploy`:

```zsh
$ slack deploy
```

After deploying, [create a new Link Trigger](#create-a-link-trigger) for the
production version of your app (not appended with `(dev)`). Once the Trigger is
invoked, the Workflow should run just as it did in when developing locally.

### Viewing Activity Logs

Activity logs for the production instance of your application can be viewed with
the `slack activity` command:

```zsh
$ slack activity
```

## Project Structure

### `manifest.ts`

The [app manifest](https://api.slack.com/future/manifest) contains the app's
configuration. This file defines attributes like app name and description.

### `slack.json`

Used by the CLI to interact with the project's SDK dependencies. It contains
script hooks that are executed by the CLI and implemented by the SDK.

### `/functions`

[Functions](https://api.slack.com/future/functions) are reusable building blocks
of automation that accept inputs, perform calculations, and provide outputs.
Functions can be used independently or as steps in Workflows.

### `/workflows`

A [Workflow](https://api.slack.com/future/workflows) is a set of steps that are
executed in order. Each step in a Workflow is a function.

Workflows can be configured to run without user input or they can collect input
by beginning with a [form](https://api.slack.com/future/forms) before continuing
to the next step.

### `/triggers`

[Triggers](https://api.slack.com/future/triggers) determine when Workflows are
executed. A trigger file describes a scenario in which a workflow should be run,
such as a user pressing a button or when a specific event occurs.

## Resources

To learn more about developing with the CLI, you can visit the following guides:

- [Creating a new app with the CLI](https://api.slack.com/future/create)
- [Configuring your app](https://api.slack.com/future/manifest)
- [Developing locally](https://api.slack.com/future/run)

To view all documentation and guides available, visit the
[Overview page](https://api.slack.com/future/overview).
