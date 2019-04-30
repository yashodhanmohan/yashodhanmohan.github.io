import React from "react";
import { withStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from "@material-ui/icons/Delete";
import Grid from "@material-ui/core/Grid";

const styles = {
    container: {
        paddingLeft: 10,
        paddingRight: 10
    },
    gridContainer: {
        alignItems: "center"
    }
};

function FileBox(props) {
    const { classes, theme, onClick, index } = props;
    return (
        <div>
            <Paper className={classes.container} square style={{
                fontFamily: theme.typography.fontFamily
            }}>
                <Grid container className={classes.gridContainer}>
                    <Grid item xs={11}>
                        {props.file.name}
                    </Grid>
                    <Grid item xs={1}>
                        <IconButton onClick={e => onClick(index)} className={classes.button} aria-label="Delete" color="primary">
                            <DeleteIcon />
                        </IconButton>
                    </Grid>
                </Grid>
            </Paper>
        </div>
    );
}

export default withStyles(styles, { withTheme: true })(FileBox);