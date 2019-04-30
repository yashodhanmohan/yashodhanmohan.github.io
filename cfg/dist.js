"use strict";

let path = require("path");
let webpack = require("webpack");

let baseConfig = require("./base");
let defaultSettings = require("./defaults");

const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

let config = Object.assign({}, baseConfig, {
    entry: path.join(__dirname, "../src/index"),
    cache: false,
    mode: "production",
    devtool: "sourcemap",
    plugins: [
        new webpack.DefinePlugin({
            "process.env.NODE_ENV": '"production"'
        }),
        new webpack.optimize.AggressiveMergingPlugin(),
        new webpack.NoEmitOnErrorsPlugin()
    ],
    optimization: {
        minimizer: [new UglifyJsPlugin()]
    },
    module: defaultSettings.getDefaultModules()
});

config.module.rules.push({
    test: /\.(js|jsx|tsx)$/,
    loader: "babel-loader",
    options: {
        plugins: [
            ["@babel/plugin-proposal-class-properties", { "loose": true }]
        ],
        presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"]
    },
    include: [].concat(defaultSettings.additionalPaths, [
        path.join(__dirname, "/../src")
    ])
});

module.exports = config;
