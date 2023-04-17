import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import "App.css";
import useDebounced from "functions/useDebounced";
import getVideoId from "get-video-id";
import { useEffect, useState } from "react";

function App() {
  const videoUrl = useDebounced("");
  const [showOptions, setShowOptions] = useState(false);
  const [videoBuf, setVideoBuf] = useState<ArrayBuffer>();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      const videoId = getVideoId(videoUrl.debounced);
      if (videoId.service === "youtube" && videoId.id) {
        if (signal.aborted) return;
        const result = await fetch(
          `/download?url=${encodeURIComponent(videoUrl.debounced)}`,
          { signal }
        );
        if (signal.aborted) return;
        const buffer = await result.arrayBuffer();
        if (signal.aborted) return;
        setVideoBuf(buffer);
      }
    })();

    return () => controller.abort();
  }, [videoUrl.debounced]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <Container component="main" sx={{ mt: 8, mb: 2 }} maxWidth="sm">
        <Box sx={{ display: "flex", flexDirection: "row" }}>
          <Accordion
            style={{ flex: 1 }}
            expanded={showOptions || !videoBuf}
            onChange={(_, show) => setShowOptions(show)}
          >
            <AccordionSummary>
              <Typography component="h1" variant="h5" gutterBottom>
                looper
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                type="text"
                fullWidth
                margin="normal"
                label="video url"
                variant="outlined"
                value={videoUrl.value}
                onChange={({ target }) => videoUrl.set(target.value || "")}
              />
            </AccordionDetails>
          </Accordion>
        </Box>
      </Container>
      {videoBuf?.byteLength}
    </Box>
  );
}

export default App;
