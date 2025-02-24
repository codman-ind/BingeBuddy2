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
                                text: `Based on the input "${userInput}", determine whether it is a movie, TV show, or song. Then, suggest exactly 7 very similar recommendations of the same type. Format each recommendation as: "Title - Type". Only return the list, also explanations.`
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
        const lastFmApiKey = process.env.LAST_FM_API_KEY;

        if (!omdbApiKey || !lastFmApiKey) {
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

                        if (omdbResponse.data.Response === "True") {
                            return {
                                title: omdbResponse.data.Title,
                                type: item.type,
                                image: omdbResponse.data.Poster !== "N/A" ? omdbResponse.data.Poster : "/images/default.jpg",
                                genre: omdbResponse.data.Genre || "Unknown",
                                platform: "N/A"
                            };
                        } else {
                            console.error(`OMDb API Error for ${item.title}: ${omdbResponse.data.Error}`);
                            return null; // Skip invalid results
                        }
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
