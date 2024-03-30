# FabtrackJS

FabtrackJS is an opensource platform for tracking user activity, projects and inventory in fablabs written in NodeJS.

It's designed to be easy to use and not too much fuss.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
  - [Generator](#generator)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Background

Initially I wrote the project in PHP/MySQL for the fablab at [Sorbonne University](https://fablab.sorbonne-universite.fr) but a lot of the features were very specific to that fablab's organization. I thought that the core functionalities however could easily apply to any fablabs and decided to make a new open source version.

I decided to develop it in NodeJS/Express because I needed to start from scratch to make it more modular, with cleaner code and comments. And because I find Javascript more pleasant to work with.

## Install

This project uses [node](http://nodejs.org) and numerous [npm](https://npmjs.com) libraries, so go check them out if you don't have them locally installed. You'll also need access to a [MySQL](http://mysql.org) server.

Clone this repository on your server.

```sh
$ git clone
```

Go to the root of the folder and run the installer. You'll be prompted for your configuration,

```sh
$ node install.js
```

Install Prisma

```sh
$ git clone
```

Create the MySQL database with Prisma.

## Usage

This is only a documentation package. You can print out [spec.md](spec.md) to your console:

```sh
$ standard-readme-spec
# Prints out the standard-readme spec
```

### Generator

To use the generator, look at [generator-standard-readme](https://github.com/RichardLitt/generator-standard-readme). There is a global executable to run the generator in that package, aliased as `standard-readme`.

## Badge

If your README is compliant with Standard-Readme and you're on GitHub, it would be great if you could add the badge. This allows people to link back to this Spec, and helps adoption of the README. The badge is **not required**.

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

To add in Markdown format, use this code:

```
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
```

## Example Readmes

To see how the specification has been applied, see the [example-readmes](example-readmes/).

## Maintainers

[@RichardLitt](https://github.com/RichardLitt).

## Contributing

Feel free to dive in! [Open an issue](https://github.com/RichardLitt/standard-readme/issues/new) or submit PRs.

Standard Readme follows the [Contributor Covenant](http://contributor-covenant.org/version/1/3/0/) Code of Conduct.

### Contributors

This project exists thanks to all the people who contribute.
<a href="https://github.com/RichardLitt/standard-readme/graphs/contributors"><img src="https://opencollective.com/standard-readme/contributors.svg?width=890&button=false" /></a>

## License

[MIT](LICENSE) © Richard Littauer
