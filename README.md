# FabtrackJS

FabtrackJS is an open source platform for tracking user activity, projects and inventory in fablabs written in NodeJS.

It's designed to be easy to use and not too much fuss.

## Table of Contents

- [Background](#background)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Features](#features)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Background

Initially I wrote the project in PHP/MySQL for the fablab at [Sorbonne University](https://fablab.sorbonne-universite.fr) but a lot of the features were very specific to that fablab's organization. I thought that the core functionalities however could easily apply to any fablabs and decided to make a new open source version.

I decided to develop it in NodeJS/Express because I needed to start from scratch to make it more modular, with cleaner code and comments. And because I find Javascript more pleasant to work with.

## Prerequisites

Before installing FabtrackJS, make sure you have the following:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)
- [MySQL](https://www.mysql.com/) server (v5.7 or higher)
- Git

## Installation

1. Clone this repository:

```sh
$ git clone https://github.com/yourusername/fabtrackjs.git
$ cd fabtrackjs
```

2. Install dependencies:

```sh
$ npm install
```

3. Set up environment variables by creating a `.env` file in the root directory:

```sh
# Database connection
DATABASE_URL="mysql://username:password@localhost:3306/fabtrack"

# Session configuration
SECRET="your-secret-key-here"
SESSION_DURATION=86400000  # 24 hours in milliseconds

# Server configuration
PORT=8080
```

4. Initialize the database with Prisma:

```sh
# Install Prisma CLI globally if you haven't already
$ npm install -g prisma

# Generate Prisma client
$ npx prisma generate

# Create and migrate the database
$ npx prisma migrate dev --name init
```

5. Seed the database with initial data:

```sh
$ npx prisma db seed
```

## Configuration

FabtrackJS can be configured through the `.env` file. Here are some important configuration options:

- `DATABASE_URL`: Your MySQL connection string
- `SECRET`: Secret key for session encryption
- `SESSION_DURATION`: Session duration in milliseconds
- `PORT`: The port on which the application will run

## Usage

To start the application in development mode:

```sh
$ npm run dev
```

For production:

```sh
$ npm start
```

The application will be available at `http://localhost:8080` (or the port you specified).

## Features

- User management and tracking
- Project tracking
- Machine and equipment inventory
- Workspace management
- Activity logging
- Plugin system for extensibility
- Real-time notifications with Socket.io

## Development

### Plugin System

FabtrackJS includes a plugin system that allows you to extend functionality:

1. Create a new file in the `plugins/` directory
2. Export an object with a `register` method that accepts the hookManager
3. Add your custom hooks

Example plugin:

```js
module.exports = {
  name: "My Custom Plugin",
  version: "1.0.0",
  register: function(hookManager) {
    hookManager.addHook("customEvent", async (data) => {
      // Your custom logic here
      return processedData;
    });
  }
};
```

### Adding Hooks

You can create custom hooks in the `hooks/` directory:

```js
module.exports = () => {
  hookManager.addHook("eventName", (data) => {
    // Process data
    return result;
  });
};
```

## Troubleshooting

### Common Issues

- **Database Connection Errors**: Verify your MySQL server is running and the credentials in `.env` are correct.
- **Missing Dependencies**: Run `npm install` to ensure all dependencies are installed.
- **Port Already in Use**: Change the PORT in your `.env` file if 8080 is already in use.

## Contributing

This project follows the [Contributor Covenant](http://contributor-covenant.org/version/2.0/0/) Code of Conduct.

## License

[MIT](LICENSE) © Stéphane Muller
