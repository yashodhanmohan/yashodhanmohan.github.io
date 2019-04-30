"use strict";

let path = require("path");
let webpack = require("webpack");
let baseConfig = require("./base");
let defaultSettings = require("./defaults");

let config = Object.assign({}, baseConfig, {
    mode: "development",
    entry: [
        "webpack-dev-server/client?http://127.0.0.1:" + defaultSettings.port,
        "webpack/hot/only-dev-server",
        "./src/index"
    ],
    cache: true,
    devtool: "eval-source-map",
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin()
    ],
    module: defaultSettings.getDefaultModules()
});

config.module.rules.push({
    test: /\.(js|jsx|tsx)$/,
    use: [{
        loader: "react-hot-loader/webpack"
    }, {
        loader: "babel-loader",
        options: {
            plugins: [
                ["@babel/plugin-proposal-class-properties", { "loose": true }]
            ],
            presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"]
        }
    }],
    include: [].concat(defaultSettings.additionalPaths, [
        path.join(__dirname, "/../src")
    ])
});

module.exports = config;
