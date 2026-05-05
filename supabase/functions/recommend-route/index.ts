import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hub stations for alternative routes
const HUB_STATIONS = [
  "NDLS", "BCT", "HWH", "MAS", "SBC", "SC", "PNBE", "LKO", "JP", "ADI",
  "BPL", "NGP", "VSKP", "TVC", "GHY", "JAT", "CNB", "ET", "ALD", "RJPB"
];

// Parse duration string to minutes
const parseDuration = (duration: string): number => {
  if (!duration) return 0;
  let match = duration.match(/(\d+)h\s*(\d+)m?/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  match = duration.match(/(\d+):(\d+)/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  match = duration.match(/(\d+)h/);
  if (match) return parseInt(match[1]) * 60;
  return 0;
};

// Calculate total duration
const calculateTotalDuration = (duration1: string, duration2: string): string => {
  const totalMinutes = parseDuration(duration1) + parseDuration(duration2);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
};

// Check if seats are available
const hasAvailableSeats = (availability: string | undefined): boolean => {
  if (!availability) return false;
  return (
    availability.includes("AVAILABLE") ||
    availability.includes("AVBL") ||
    (availability.match(/^\d+$/) !== null && parseInt(availability) > 0)
  );
};

// Class mapping
const CLASS_MAP: Record<string, string> = {
  'CC': '3A', 'EC': '2A', '3A': '3A', '2A': '2A', 'SL': 'SL', '1A': '1A', '2S': 'SL', '3E': '3A'
};

// Process train data
const processTrainList = (trainList: any[], from: string, to: string): any[] => {
  const trains: any[] = [];
  trainList.forEach((train: any) => {
    const trainObj: any = {
      trainNumber: train.train_number,
      trainName: train.train_name,
      source: from,
      destination: to,
      departureTime: train.from_std || train.from_sta,
      arrivalTime: train.to_sta || train.to_std,
      duration: train.duration,
      availability: {},
      fare: {}
    };
    if (train.sa_data && Array.isArray(train.sa_data)) {
      train.sa_data.forEach((sa: any) => {
        const mappedClass = CLASS_MAP[sa.booking_class] || sa.booking_class;
        if (sa.seat_availibility && sa.seat_availibility.length > 0) {
          const seatData = sa.seat_availibility[0];
          trainObj.availability[mappedClass] = seatData[`Class - ${sa.booking_class}`] || sa.availibility;
          trainObj.fare[mappedClass] = parseFloat(seatData.total_fare || 0);
        } else if (sa.availibility) {
          trainObj.availability[mappedClass] = sa.availibility;
          trainObj.fare[mappedClass] = 0;
        }
      });
    }
    if (Object.keys(trainObj.availability).length > 0) {
      trains.push(trainObj);
    }
  });
  return trains;
};

// Fetch trains for a route
const fetchTrainsForRoute = async (from: string, to: string, formattedDate: string): Promise<any[]> => {
  try {
    const url = `https://trainticketapi.railyatri.in/api/trains-between-station-with-sa.json?from=${from}&to=${to}&dateOfJourney=${formattedDate}&journey_quota=GN`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    
    let trains: any[] = [];
    if (data.train_between_stations && Array.isArray(data.train_between_stations)) {
      trains = processTrainList(data.train_between_stations, from, to);
    }
    if (trains.length === 0 && data.alternate_trains && Array.isArray(data.alternate_trains)) {
      trains = processTrainList(data.alternate_trains, from, to);
    }
    return trains;
  } catch (error) {
    console.error(`Error fetching ${from}->${to}:`, error);
    return [];
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { from, to, date, trainClass, findBestRoutes } = await req.json();
    
    // If findBestRoutes is true, search for optimal routes via hub stations
    if (findBestRoutes) {
      if (!from || !to || !date || !trainClass) {
        return new Response(
          JSON.stringify({ error: "Missing required parameters: from, to, date, trainClass" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🔍 AI searching best routes: ${from} → ${to} on ${date}, class ${trainClass}`);

      const potentialHubs = HUB_STATIONS.filter((hub) => hub !== from && hub !== to);
      const allRoutes: any[] = [];

      // Fetch direct trains first
      const directTrains = await fetchTrainsForRoute(from, to, date);
      console.log(`Direct trains found: ${directTrains.length}`);

      directTrains.forEach((train) => {
        if (train.availability[trainClass] !== undefined) {
          allRoutes.push({
            type: "direct",
            trains: [train],
            totalDuration: train.duration,
            totalFare: train.fare[trainClass] || 0,
            durationMinutes: parseDuration(train.duration),
            hasSeats: hasAvailableSeats(train.availability[trainClass])
          });
        }
      });

      // Search via hub stations in parallel (limit to 8 hubs for speed)
      const hubsToSearch = potentialHubs.slice(0, 8);
      console.log(`Searching via ${hubsToSearch.length} hub stations...`);

      const hubPromises = hubsToSearch.map(async (hub) => {
        const [leg1Trains, leg2Trains] = await Promise.all([
          fetchTrainsForRoute(from, hub, date),
          fetchTrainsForRoute(hub, to, date)
        ]);

        const routes: any[] = [];
        const leg1Filtered = leg1Trains.filter(t => t.availability[trainClass] !== undefined).slice(0, 5);
        const leg2Filtered = leg2Trains.filter(t => t.availability[trainClass] !== undefined).slice(0, 5);

        for (const t1 of leg1Filtered) {
          for (const t2 of leg2Filtered) {
            const totalDuration = calculateTotalDuration(t1.duration, t2.duration);
            const totalFare = (t1.fare[trainClass] || 0) + (t2.fare[trainClass] || 0);
            routes.push({
              type: "alternative",
              viaStation: hub,
              trains: [t1, t2],
              totalDuration,
              totalFare,
              durationMinutes: parseDuration(totalDuration),
              hasSeats: hasAvailableSeats(t1.availability[trainClass]) && hasAvailableSeats(t2.availability[trainClass])
            });
          }
        }
        return routes;
      });

      const hubResults = await Promise.all(hubPromises);
      hubResults.forEach(routes => allRoutes.push(...routes));

      console.log(`Total routes found: ${allRoutes.length}`);

      // Sort by: available seats first, then duration (lowest first)
      allRoutes.sort((a, b) => {
        if (a.hasSeats && !b.hasSeats) return -1;
        if (!a.hasSeats && b.hasSeats) return 1;
        return a.durationMinutes - b.durationMinutes;
      });

      // Take top 15 routes
      const topRoutes = allRoutes.slice(0, 15);

      // Use AI to analyze and recommend the best
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        // Return sorted routes without AI analysis
        return new Response(
          JSON.stringify({ 
            success: true, 
            routes: topRoutes,
            recommendation: {
              recommendedIndex: 0,
              reason: `Sorted by lowest duration. Top route: ${topRoutes[0]?.totalDuration || 'N/A'}`,
              tips: ["Routes sorted by duration and seat availability"]
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Format for AI
      const routesSummary = topRoutes.slice(0, 8).map((route: any, index: number) => {
        const trainDetails = route.trains.map((train: any) => 
          `${train.trainNumber} (${train.trainName}): ${train.source}→${train.destination}, Duration: ${train.duration}, Seats: ${train.availability[trainClass] || 'N/A'}, Fare: ₹${train.fare[trainClass] || 'N/A'}`
        ).join('; ');
        return `Route ${index + 1} (${route.type === 'direct' ? 'Direct' : 'Via ' + route.viaStation}): Total ${route.totalDuration}, ${trainDetails}`;
      }).join('\n');

      const prompt = `Analyze these train routes from ${from} to ${to} and recommend the BEST one for ${trainClass} class.

Routes:
${routesSummary}

Criteria: Shortest duration is most important, then seat availability, then fewer connections.

Respond ONLY with JSON:
{"recommendedIndex": <0-based index>, "reason": "<short explanation>", "tips": ["<tip1>", "<tip2>"]}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are an Indian Railways expert. Respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
        }),
      });

      if (!response.ok) {
        console.error("AI error:", response.status);
        return new Response(
          JSON.stringify({ 
            success: true, 
            routes: topRoutes,
            recommendation: { recommendedIndex: 0, reason: "Shortest duration route", tips: ["Sorted by travel time"] }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      let recommendation = { recommendedIndex: 0, reason: "Shortest duration route selected", tips: ["Sorted by travel time"] };
      try {
        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          recommendation = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Parse error:", e);
      }

      return new Response(
        JSON.stringify({ success: true, routes: topRoutes, recommendation }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Original recommendation-only flow
    const { routes } = await req.json();
    
    if (!routes || routes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No routes provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const routesSummary = routes.map((route: any, index: number) => {
      const trainDetails = route.trains.map((train: any) => {
        const availability = train.availability?.[routes[0]?.trainClass || '3A'];
        const fare = train.fare?.[routes[0]?.trainClass || '3A'];
        return `Train ${train.trainNumber} (${train.trainName}): ${train.source} → ${train.destination}, Duration: ${train.duration}`;
      }).join('\n    ');
      return `Route ${index + 1} (${route.type === 'direct' ? 'Direct' : 'Alternative'}):\n    ${trainDetails}`;
    }).join('\n\n');

    const prompt = `Analyze these routes and recommend the best:\n${routesSummary}\n\nRespond with JSON: {"recommendedIndex": <index>, "reason": "<reason>", "tips": ["<tip>"]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    let recommendation = { recommendedIndex: 0, reason: "Best available option", tips: [] };
    try {
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) recommendation = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Parse error");
    }

    return new Response(
      JSON.stringify({ success: true, recommendation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
