var createError = require("http-errors");
var express = require("express");
const session = require("express-session");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

const dotenv = require("dotenv");
dotenv.config();

// Routes setup
var indexRouter = require("./routes/index");
var apiRouter = require("./routes/api");
var adminRouter = require("./routes/admin");
var staffRouter = require("./routes/staff");
var usersRouter = require("./routes/users");
var usertypesRouter = require("./routes/usertypes");
var projecttypesRouter = require("./routes/projecttypes");
var machinesRouter = require("./routes/machines");
var locationsRouter = require("./routes/locations");
var warningtypesRouter = require("./routes/warningtypes");
var accessRouter = require("./routes/accesslevels");
var fabTrackRouter = require("./routes/fabtrack");
var historyRouter = require("./routes/history");
var warningsRouter = require("./routes/warnings");

var app = express();

// View engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: parseInt(process.env.SESSION_DURATION) },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", indexRouter);
app.use("/api", apiRouter);
app.use("/admin", adminRouter);
app.use("/admin/staff", staffRouter);
app.use("/users", usersRouter);
app.use("/admin/usertypes", usertypesRouter);
app.use("/admin/projecttypes", projecttypesRouter);
app.use("/admin/machines", machinesRouter);
app.use("/admin/locations", locationsRouter);
app.use("/admin/warningtypes", warningtypesRouter);
app.use("/admin/access", accessRouter);
app.use("/fabtrack", fabTrackRouter);
app.use("/history", historyRouter);
app.use("/warning", warningsRouter);

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // Render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
