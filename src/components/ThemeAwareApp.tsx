import React from "react";
import { MuiThemeProvider, createMuiTheme } from "@material-ui/core/styles";
import App from "./App";

const theme = createMuiTheme({
    palette: {
        primary: {
            light: "#484848",
            main: "#212121",
            dark: "#000000",
            contrastText: "#00e676"
        },
        secondary: {
            light: "#9cff57",
            main: "#64dd17",
            dark: "#1faa00",
            contrastText: "#212121"
        },
        text: {
            primary: "#00e676",
            secondary: "#212121",
        }
    },
    typography: {
        useNextVariants: true,
        fontFamily: [
            "Courier",
            "-apple-system",
            "BlinkMacSystemFont",
            '"Segoe UI"',
            "Roboto",
            '"Helvetica Neue"',
            "sans-serif",
            '"Apple Color Emoji"',
            '"Segoe UI Emoji"',
            '"Segoe UI Symbol"'
        ].join(",")
    }
});

function ThemeAwareApp() {
    return (
        <MuiThemeProvider theme={theme}>
            <App />
        </MuiThemeProvider>
    );
}

export default ThemeAwareApp;
