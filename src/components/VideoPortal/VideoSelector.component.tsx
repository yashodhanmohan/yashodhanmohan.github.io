import React from "react";
import { withStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Grid from "@material-ui/core/Grid";
import IconButton from '@material-ui/core/IconButton';
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import PlayCircleOutlineIcon from "@material-ui/icons/PlayCircleOutline";


const styles = {
    container: {
        paddingLeft: 10,
        paddingRight: 10
    },
    gridContainer: {
        alignItems: "center"
    }
}

function VideoSelector(props) {
    const { classes, theme, handlePlay, videoId, videoName, playingNow } = props;
    return (
        <div>
            <Paper className={classes.container} square style={{
                fontFamily: theme.typography.fontFamily
            }}>
                <Grid container className={classes.gridContainer}>
                    <Grid item xs={9}>
                        {videoName ? videoName : videoId} {playingNow ? " [Playing] " : ""}
                    </Grid>
                    <Grid item xs={1}>
                        <IconButton onClick={e => handlePlay(e, videoId)} className={classes.button} aria-label="Play" color="primary">
                            <PlayCircleOutlineIcon />
                        </IconButton>
                    </Grid>
                    <Grid item xs={1}>
                        <IconButton className={classes.button} aria-label="Edit" color="primary">
                            <EditIcon />
                        </IconButton>
                    </Grid>
                    <Grid item xs={1}>
                        <IconButton className={classes.button} aria-label="Delete" color="primary">
                            <DeleteIcon />
                        </IconButton>
                    </Grid>
                </Grid>
            </Paper>
        </div>
    )
}

export default withStyles(styles, { withTheme: true })(VideoSelector);