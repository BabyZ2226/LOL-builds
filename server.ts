import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/config-check", (req, res) => {
    res.json({
      riotKeyConfigured: !!process.env.RIOT_API_KEY,
      geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === "production"
    });
  });

  // Helper to map platform to routing region
  const getRoutingRegion = (platform: string) => {
    const mapping: Record<string, string> = {
      na1: "americas",
      la1: "americas",
      la2: "americas",
      br1: "americas",
      euw1: "europe",
      eun1: "europe",
      tr1: "europe",
      ru: "europe",
      kr: "asia",
      jp1: "asia",
      oc1: "sea",
      ph2: "sea",
      sg2: "sea",
      th2: "sea",
      tw2: "sea",
      vn2: "sea",
      // Aliases
      lan: "americas",
      las: "americas",
      br: "americas",
      na: "americas",
      euw: "europe",
      eune: "europe",
      tr: "europe",
      oc: "sea",
      ph: "sea",
      sg: "sea",
      th: "sea",
      tw: "sea",
      vn: "sea",
    };
    return mapping[platform.toLowerCase()] || "americas";
  };

  // Riot API Proxy
  app.get("/api/riot/summoner/:region/:name", async (req, res) => {
    const { region, name } = req.params;
    // Check for client-side override first, then environment variable
    const apiKey = req.headers["x-riot-token-override"] as string || process.env.RIOT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "RIOT_API_KEY not configured. Please set it in Settings." });
    }

    try {
      let summonerData;
      const platformHost = `${region}.api.riotgames.com`;
      const routingRegion = getRoutingRegion(region);
      const routingHost = `${routingRegion}.api.riotgames.com`;

      console.log(`[RiotProxy] Fetching summoner: ${name} in ${region} (Routing: ${routingRegion})`);

      // Handle Riot ID (Name#Tag)
      if (name.includes("#")) {
        const parts = name.split("#");
        const gameName = parts[0].trim();
        const tagLine = parts[1].trim();
        
        if (!gameName || !tagLine) {
          return res.status(400).json({ error: "Formato de Riot ID inválido. Usa Nombre#Tag" });
        }

        console.log(`[RiotProxy] Using Account-v1 for ${gameName}#${tagLine} via ${routingHost}`);
        
        const accountUrl = `https://${routingHost}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
        console.log(`[RiotProxy] Fetching: ${accountUrl}`);

        const accountRes = await fetch(accountUrl, { headers: { "X-Riot-Token": apiKey } });

        if (!accountRes.ok) {
          const errorData: any = await accountRes.json();
          console.error(`[RiotProxy] Account-v1 failed: ${accountRes.status}`, errorData);
          return res.status(accountRes.status).json({ 
            ...errorData, 
            message: `Error de Riot (Account-v1): ${errorData.status?.message || "No se encontró la cuenta de Riot"}. Asegúrate de que el nombre y el tag (#) sean correctos.` 
          });
        }

        const accountData: any = await accountRes.json();
        const puuid = accountData.puuid;
        console.log(`[RiotProxy] Found PUUID: ${puuid}. Fetching summoner data...`);

        // Get Summoner by PUUID
        const summonerRes = await fetch(
          `https://${platformHost}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
          { headers: { "X-Riot-Token": apiKey } }
        );

        if (!summonerRes.ok) {
          const errorData: any = await summonerRes.json();
          console.error(`[RiotProxy] Summoner-v4 failed: ${summonerRes.status}`, errorData);
          return res.status(summonerRes.status).json({ 
            ...errorData, 
            message: `Error de Riot (Summoner-v4): ${errorData.status?.message || "No se encontró el invocador para este PUUID"}` 
          });
        }

        summonerData = await summonerRes.json();
      } else {
        // Fallback to old Summoner Name
        console.log(`[RiotProxy] Using deprecated Summoner-v4 by-name for ${name}`);
        const response = await fetch(
          `https://${platformHost}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(name)}`,
          { headers: { "X-Riot-Token": apiKey } }
        );

        if (!response.ok) {
          const errorData: any = await response.json();
          console.error(`[RiotProxy] Summoner-v4 by-name failed: ${response.status}`, errorData);
          return res.status(response.status).json({ 
            ...errorData, 
            message: "No se encontró el invocador. Riot ahora requiere el formato Nombre#Tag. Por favor, inténtalo de nuevo con tu ID completo." 
          });
        }

        summonerData = await response.json();
      }

      console.log(`[RiotProxy] Success! Found summoner: ${summonerData.name}`);
      res.json(summonerData);
    } catch (error: any) {
      console.error("[RiotProxy] Critical Error:", error);
      res.status(500).json({ error: "Error interno al contactar con Riot", details: error.message });
    }
  });

  app.get("/api/riot/active-game/:region/:puuid", async (req, res) => {
    const { region, puuid } = req.params;
    const apiKey = req.headers["x-riot-token-override"] as string || process.env.RIOT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "RIOT_API_KEY not configured" });
    }

    try {
      const host = `${region}.api.riotgames.com`;
      // Use spectator-v5 which uses PUUID
      const response = await fetch(
        `https://${host}/lol/spectator/v5/active-games/by-summoner/${puuid}`,
        { headers: { "X-Riot-Token": apiKey } }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "No active game found" });
        }
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active game" });
    }
  });

  app.get("/api/riot/league/:region/:summonerId", async (req, res) => {
    const { region, summonerId } = req.params;
    const apiKey = req.headers["x-riot-token-override"] as string || process.env.RIOT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "RIOT_API_KEY not configured" });
    }

    try {
      const host = `${region}.api.riotgames.com`;
      const response = await fetch(
        `https://${host}/lol/league/v4/entries/by-summoner/${summonerId}`,
        { headers: { "X-Riot-Token": apiKey } }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch league info" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
