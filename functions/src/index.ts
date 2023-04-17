import { Datastore } from "@google-cloud/datastore";
import { https, logger } from "firebase-functions";
import { request } from "https";
import ytdl from "ytdl-core";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const downloadLimit = 4 * GB;
const debug = false ? logger.log : (..._: any[]) => {};

const getSize = (url: string) =>
  new Promise<string | undefined>((resolve) =>
    request(url, { method: "HEAD" }, (res) => {
      resolve(res.headers["content-length"]);
    }).end()
  );

export const download = https.onRequest(async (req, res) => {
  try {
    debug("Getting video info");
    const info = await ytdl.getInfo(String(req.query.url));
    let formats = ytdl
      .filterFormats(info.formats, "videoandaudio")
      .filter(
        ({ contentLength }) =>
          !contentLength || parseInt(contentLength) < 10 * MB
      );
    let format: ytdl.videoFormat | undefined;

    debug("Finding best format that can be returned");
    do {
      if (formats.length === 0) {
        res.status(500);
        res.send({
          message: "No format found under the maximum download size of 10MB",
          formats: info.formats,
        });
        return;
      }

      //Formats should be sorted from highest quality to lowest
      format = formats[0];

      if (!format.contentLength) {
        const size = await getSize(format.url);
        if (!size || parseInt(size) >= 10 * MB) {
          debug("Removing format with size " + size, format);
          const { url } = format;
          formats = formats.filter((f) => f.url === url);
          format = undefined;
        } else {
          format.contentLength = size.toString();
        }
      }
    } while (!format);
    debug("Found video format", format);

    debug("Checking usage limits");
    const size = parseInt(format.contentLength);
    const delay = 100;
    const now = new Date();
    const datastore = new Datastore();
    const key = datastore.key([
      "MonthlyUsage",
      `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
    ]);
    const overLimit = await (async () => {
      try {
        debug(`Updating usage with another ${size} bytes`);
        for (const i of Array(5).keys()) {
          const transaction = datastore.transaction();
          try {
            await transaction.run();
            const [usage] = await transaction.get(key);
            const bytesDownloaded = (usage?.bytesDownloaded || 0) + size;
            if (bytesDownloaded > downloadLimit) {
              transaction.rollback();
              return true;
            }
            await transaction.save({ key, bytesDownloaded });
            await transaction.commit();
            debug(`Total usage: ${bytesDownloaded}`);
            return false;
          } catch (e) {
            await new Promise((r) => setTimeout(r, delay * (2 << i)));
          }
        }
      } catch (e) {
        logger.error(e);
      }
      return true;
    })();
    if (overLimit) {
      res.status(500);
      res.send({ message: "App has used its monthly data allowance" });
      return;
    }

    debug("Setting cache headers");
    res.header("Cache-Control", "max-age=3600");
    const lastModified = format.lastModified
      ? new Date(
          /^[0-9]+$/.test(format.lastModified)
            ? parseInt(format.lastModified)
            : format.lastModified
        )
      : undefined;
    if (lastModified) {
      res.header("Last-Modified", lastModified.toUTCString());
      const modifiedSince = req.header("If-Modified-Since");
      if (modifiedSince && lastModified <= new Date(modifiedSince)) {
        res.status(304);
        return;
      }
    }

    debug("Downloading data");
    const stream = ytdl.downloadFromInfo(info, { format });
    res.status(200);
    stream.pipe(res);
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.send({ error });
  }
});
