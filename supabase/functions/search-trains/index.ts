import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { from, to, date, trainClass } = await req.json();
    console.log('Searching trains:', { from, to, date, trainClass });

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      throw new Error('RAPIDAPI_KEY not configured');
    }

    // Format date for API (YYYY-MM-DD format)
    const formattedDate = new Date(date).toISOString().split('T')[0];

    // Call RapidAPI IRCTC API (v3 endpoint that was working earlier)
    const response = await fetch(
      `https://irctc1.p.rapidapi.com/api/v3/trainBetweenStations?fromStationCode=${from}&toStationCode=${to}&dateOfJourney=${formattedDate}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'irctc1.p.rapidapi.com'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please upgrade your RapidAPI plan or try again later.');
      }
      
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('API response:', JSON.stringify(data).substring(0, 500));

    // Transform API response to our format
    const trains = transformApiResponse(data, from, to, trainClass);

    return new Response(
      JSON.stringify({ trains }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in search-trains function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function transformApiResponse(apiData: any, from: string, to: string, trainClass: string) {
  // Handle the new API response structure with train_between_stations
  if (!apiData || !apiData.train_between_stations || !Array.isArray(apiData.train_between_stations)) {
    console.log('No trains found in API response');
    return [];
  }

  // Map coach types to standard class codes
  const classMap: Record<string, string> = {
    'CC': '3A',  // AC Chair Car
    'EC': '2A',  // Exec Chair Car  
    '3A': '3A',
    '2A': '2A',
    'SL': 'SL',
    '1A': '1A'
  };

  return apiData.train_between_stations.map((train: any) => {
    let availability = 'NOT AVAILABLE';
    let fare = 0;

    // Check sa_data array for availability and fare information
    if (train.sa_data && Array.isArray(train.sa_data)) {
      // Try to find matching class in sa_data
      const saData = train.sa_data.find((sa: any) => {
        const mappedClass = classMap[sa.booking_class] || sa.booking_class;
        return mappedClass === trainClass;
      });

      if (saData && saData.seat_availibility && saData.seat_availibility.length > 0) {
        const seatData = saData.seat_availibility[0];
        // Get availability status (e.g., "WL14", "AVBL-0046")
        availability = seatData[`Class - ${saData.booking_class}`] || saData.availibility || 'NOT AVAILABLE';
        // Get total fare
        fare = parseFloat(seatData.total_fare || seatData.ticket_fare || 0);
      }
    }

    // If no data in sa_data, check class_type array
    if (fare === 0 && train.class_type && Array.isArray(train.class_type)) {
      const classInfo = train.class_type.find((c: any) => {
        const mappedClass = classMap[c.coach_type] || c.coach_type;
        return mappedClass === trainClass;
      });
      
      if (classInfo && classInfo.fare && classInfo.fare !== 'NA') {
        fare = parseFloat(classInfo.fare);
      }
    }

    return {
      number: train.train_number || '',
      name: train.train_name || '',
      from,
      to,
      departureTime: train.from_std || train.from_sta || '',
      arrivalTime: train.to_sta || train.to_std || '',
      duration: train.duration || 'N/A',
      availability: {
        [trainClass]: availability
      },
      fare: {
        [trainClass]: fare
      }
    };
  });
}

function calculateDuration(departureTime: string, arrivalTime: string): string {
  if (!departureTime || !arrivalTime) return 'N/A';
  
  const [depHour, depMin] = departureTime.split(':').map(Number);
  const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
  
  let totalMinutes = (arrHour * 60 + arrMin) - (depHour * 60 + depMin);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // Next day arrival
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}
