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
            '"Helvetica"',
            "Courier",
            "-apple-system",
            "BlinkMacSystemFont",
            '"Segoe UI"',
            "Roboto",
            "sans-serif",
            '"Apple Color Emoji"',
            '"Segoe UI Emoji"',
            '"Segoe UI Symbol"'
        ].join(","),
        h1: {
          fontWeight: 300
        },
        h2: {
          fontWeight: 300
        },
        h3: {
          fontWeight: 300
        },
        h4: {
          fontWeight: 300,
          fontSize: 27
        },
        h5: {
          fontWeight: 300,
        },
        h6: {
          fontWeight: 300,
        },
        button: {
          fontWeight: 300,
        }
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
