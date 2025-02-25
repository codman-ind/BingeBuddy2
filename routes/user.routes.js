const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/", (req, res) => {
    res.render("index");
});

router.post("/recommend", async (req, res) => {
    const userInput = req.body.query;

    try {
        // Fetch recommendations from Gemini API
        const geminiResponse = await axios.post(
            "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
            {
                contents: [
                    {
                        parts: [
                            {
                                text: `Based on the input "${userInput}", determine whether it is a movie, TV show, or song. Then, suggest exactly 7 very similar recommendations of the same type. Format each recommendation as: "Title - Type". Only return the list, no explanations.`
                            }
                        ]
                    }
                ]
            },
            {
                headers: { "Content-Type": "application/json" },
                params: { key: process.env.GEMINI_API_KEY }
            }
        );

        let recommendationsText = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse recommendations into an array
        let items = recommendationsText
            .split("\n")
            .map((line) => {
                let parts = line.split(" - ");
                return parts.length === 2
                    ? { title: parts[0].trim(), type: parts[1].trim().toLowerCase() }
                    : null;
            })
            .filter((item) => item !== null);

        // API Keys
        const omdbApiKey = process.env.OMDB_API_KEY;
        const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
        const lastFmApiKey = process.env.LAST_FM_API_KEY;

        if (!omdbApiKey || !watchmodeApiKey || !lastFmApiKey) {
            throw new Error("API keys are missing in environment variables.");
        }

        // Fetch additional details from APIs
        const enrichedRecommendations = await Promise.all(
            items.map(async (item) => {
                try {
                    if (item.type.includes("movie") || item.type.includes("tv")) {
                        // Fetch movie/TV show details from OMDb API
                        const omdbResponse = await axios.get("http://www.omdbapi.com/", {
                            params: { t: item.title, apiKey: omdbApiKey }
                        });

                        let poster = "/images/default.jpg";
                        let genre = "Unknown";

                        if (omdbResponse.data.Response === "True") {
                            poster = omdbResponse.data.Poster !== "N/A" ? omdbResponse.data.Poster : poster;
                            genre = omdbResponse.data.Genre || genre;
                        }

                        // If OMDb doesn't have a poster, try Watchmode API
                        if (poster === "/images/default.jpg") {
                            const watchmodeResponse = await axios.get("https://api.watchmode.com/v1/search/", {
                                params: { search_field: "name", search_value: item.title, apiKey: watchmodeApiKey }
                            });

                            if (watchmodeResponse.data.title_results.length > 0) {
                                poster = watchmodeResponse.data.title_results[0].poster_url || poster;
                            }
                        }

                        return {
                            title: item.title,
                            type: item.type,
                            image: poster,
                            genre: genre,
                            platform: "N/A"
                        };
                    } else if (item.type.includes("song")) {
                        // Fetch song album art from Last.fm API
                        const lastFmResponse = await axios.get("http://ws.audioscrobbler.com/2.0/", {
                            params: {
                                method: "track.search",
                                track: item.title,
                                api_key: lastFmApiKey,
                                format: "json"
                            }
                        });

                        let songImage = "/images/default-music.jpg"; // Default fallback image

                        if (
                            lastFmResponse.data.results?.trackmatches?.track &&
                            Array.isArray(lastFmResponse.data.results.trackmatches.track) &&
                            lastFmResponse.data.results.trackmatches.track.length > 0
                        ) {
                            let track = lastFmResponse.data.results.trackmatches.track[0];
                            if (track.image && Array.isArray(track.image)) {
                                const largeImage = track.image.find(img => img.size === "extralarge" && img["#text"]);
                                songImage = largeImage ? largeImage["#text"] : songImage;
                            }
                        }

                        return {
                            title: item.title,
                            type: item.type,
                            image: songImage,
                            genre: "Music",
                            platform: "N/A"
                        };
                    }
                } catch (err) {
                    console.error(`Error fetching data for ${item.title}:`, err.message);
                    return null; // Skip if error occurs
                }
            })
        );

        // Filter out null values (failed lookups)
        const validRecommendations = enrichedRecommendations.filter((item) => item !== null);

        res.render("results", { query: userInput, recommendations: validRecommendations });
    } catch (error) {
        console.error("Error fetching recommendations:", error.message);
        res.status(500).send("Error retrieving recommendations");
    }
});

module.exports = router;
