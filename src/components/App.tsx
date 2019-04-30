require("normalize.css/normalize.css");

import { withStyles } from '@material-ui/core/styles';
import AppBar from "@material-ui/core/AppBar";
import Avatar from "@material-ui/core/Avatar";
import Grid from "@material-ui/core/Grid";
import PropTypes from "prop-types";
import React from "react";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";

import CaesarCipherEncryptor from "./CaesarCipherEncryptor";
import CaseFlipper from "./CaseFlipper";
import PersonalBanner from "./PersonalBanner"
import Compressor from "./Compressor";
import VideoPortal from "./VideoPortal";
import TwitterFeed from "./TwitterFeed";

const styles = {
    root: {
        flexGrow: 1
    },
    avatar: {
        marginRight: 20
    }
};

const shuffle = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function AppComponent(props) {
    const { classes, theme } = props;

    const components = shuffle([<CaseFlipper />, <CaesarCipherEncryptor />, <VideoPortal />, <Compressor />, <TwitterFeed />]);

    return (
        <div className={classes.root}>
            <Grid container spacing={16}>
                <Grid item xs={12}>
                    <AppBar position="static" color="primary">
                        <Toolbar>
                            <Avatar className={classes.avatar} style={{ color: theme.palette.text.secondary, backgroundColor: theme.palette.text.primary }}>Y</Avatar>
                            <Typography variant="h6" color="textPrimary">
                                Yashodhan Mohan Bhatnagar
                            </Typography>
                        </Toolbar>
                    </AppBar>
                </Grid>
                <Grid item xs={12}>
                    <PersonalBanner />
                </Grid>

                {/* Actual Components start here */}

                <Grid item md={4} sm={8} xs={12}>
                    <Grid container direction="column" spacing={16}>
                        <Grid item >
                            {components[0]}
                        </Grid>
                        <Grid item >
                            {components[1]}
                        </Grid>
                    </Grid>
                </Grid>
                <Grid item md={4} sm={8} xs={12}>
                    <Grid container direction="column" spacing={16}>
                        <Grid item >
                            {components[2]}
                        </Grid>
                        <Grid item>
                            {components[3]}
                        </Grid>
                    </Grid>
                </Grid>
                <Grid item md={4} sm={8} xs={12}>
                    <Grid container direction="column" spacing={16}>
                        <Grid item >
                            {components[4]}
                        </Grid>
                    </Grid>
                </Grid>

            </Grid>
        </div>
    );
}

AppComponent.propTypes = {
    classes: PropTypes.object.isRequired
};

export default withStyles(styles, { withTheme: true })(AppComponent);
