import { Train, Route } from "@/types/train";
import { HUB_STATIONS } from "@/data/stations";
import mockData from "@/data/mockTrainData.json";

// Generate mock trains from the static JSON data
export const generateMockTrains = (from: string, to: string, date: Date): Train[] => {
  const trains: Train[] = [];
  
  // Map coach types to standard class codes
  const classMap: Record<string, string> = {
    'CC': '3A',  // AC Chair Car
    'EC': '2A',  // Exec Chair Car  
    '3A': '3A',
    '2A': '2A',
    'SL': 'SL',
    '1A': '1A'
  };

  if (mockData.train_between_stations) {
    mockData.train_between_stations.forEach((train: any) => {
      const trainObj: any = {
        number: train.train_number,
        name: train.train_name,
        from,
        to,
        departureTime: train.from_std || train.from_sta,
        arrivalTime: train.to_sta || train.to_std,
        duration: train.duration,
        availability: {},
        fare: {}
      };

      // Extract availability and fare for all classes from sa_data
      if (train.sa_data && Array.isArray(train.sa_data)) {
        train.sa_data.forEach((sa: any) => {
          const mappedClass = classMap[sa.booking_class] || sa.booking_class;
          
          if (sa.seat_availibility && sa.seat_availibility.length > 0) {
            const seatData = sa.seat_availibility[0];
            trainObj.availability[mappedClass] = seatData[`Class - ${sa.booking_class}`] || sa.availibility;
            trainObj.fare[mappedClass] = parseFloat(seatData.total_fare || 0);
          }
        });
      }

      trains.push(trainObj as Train);
    });
  }

  return trains;
};

// Helper function to calculate total duration
const calculateTotalDuration = (duration1: string, duration2: string): string => {
  const minutes1 = parseDuration(duration1);
  const minutes2 = parseDuration(duration2);
  const totalMinutes = minutes1 + minutes2;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
};

// Parse duration string to minutes
const parseDuration = (duration: string): number => {
  if (!duration) return 0;
  
  // Handle format like "10h 30m" or "10:30" or "10h30m"
  let match = duration.match(/(\d+)h\s*(\d+)m?/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  
  // Handle format like "10:30"
  match = duration.match(/(\d+):(\d+)/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  
  // Handle just hours "10h"
  match = duration.match(/(\d+)h/);
  if (match) {
    return parseInt(match[1]) * 60;
  }
  
  return 0;
};

// Class mapping for API
const CLASS_MAP: Record<string, string> = {
  'CC': '3A',
  'EC': '2A',
  '3A': '3A',
  '2A': '2A',
  'SL': 'SL',
  '1A': '1A',
  '2S': 'SL',
  '3E': '3A'
};

// Helper to check if seats are available
const hasAvailableSeats = (availability: string | undefined): boolean => {
  if (!availability) return false;
  return (
    availability.includes("AVAILABLE") ||
    availability.includes("AVBL") ||
    (availability.match(/^\d+$/) !== null && parseInt(availability) > 0)
  );
};

// Helper to process train data from API response
const processTrainList = (
  trainList: any[],
  from: string,
  to: string,
  checkDate: boolean = false,
  formattedDate?: string
): Train[] => {
  const trains: Train[] = [];

  trainList.forEach((train: any) => {
    // Date check if requested
    if (checkDate && formattedDate && train.train_date) {
      const trainDate = train.train_date.split('-').reverse().join('-');
      const searchDate = formattedDate.split('-').reverse().join('-');
      if (trainDate !== searchDate) return;
    }

    const trainObj: any = {
      number: train.train_number,
      name: train.train_name,
      from,
      to,
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
      trains.push(trainObj as Train);
    }
  });

  return trains;
};

// Fetch trains for a specific route segment
const fetchTrainsForRoute = async (
  from: string,
  to: string,
  formattedDate: string
): Promise<{ trains: Train[], trainsOnDate: Train[] }> => {
  try {
    const url = `https://trainticketapi.railyatri.in/api/trains-between-station-with-sa.json?from=${from}&to=${to}&dateOfJourney=${formattedDate}&journey_quota=GN`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();

    // Get all trains (without date filter)
    let allTrains: Train[] = [];
    if (data.train_between_stations && Array.isArray(data.train_between_stations)) {
      allTrains = processTrainList(data.train_between_stations, from, to, false);
    }
    if (allTrains.length === 0 && data.alternate_trains && Array.isArray(data.alternate_trains)) {
      allTrains = processTrainList(data.alternate_trains, from, to, false);
    }

    // Get trains on specific date
    let trainsOnDate: Train[] = [];
    if (data.train_between_stations && Array.isArray(data.train_between_stations)) {
      trainsOnDate = processTrainList(data.train_between_stations, from, to, true, formattedDate);
    }
    if (trainsOnDate.length === 0 && data.alternate_trains && Array.isArray(data.alternate_trains)) {
      trainsOnDate = processTrainList(data.alternate_trains, from, to, true, formattedDate);
    }

    return { trains: allTrains, trainsOnDate };
  } catch (error) {
    console.error(`Error fetching trains ${from} to ${to}:`, error);
    return { trains: [], trainsOnDate: [] };
  }
};

// Find alternative routes via hub stations
export const findAlternativeRoutes = async (
  from: string,
  to: string,
  date: Date,
  trainClass: string
): Promise<Route[]> => {
  const alternatives: Route[] = [];
  const potentialHubs = HUB_STATIONS.filter((hub) => hub !== from && hub !== to);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;

  console.log(`🔍 Searching alternative routes via ${potentialHubs.length} hub stations...`);

  for (const hub of potentialHubs) {
    console.log(`   Checking via ${hub}...`);

    const [firstLeg, secondLeg] = await Promise.all([
      fetchTrainsForRoute(from, hub, formattedDate),
      fetchTrainsForRoute(hub, to, formattedDate)
    ]);

    // Get all trains with the selected class (even without available seats)
    let firstLegTrains = firstLeg.trains.filter(t => t.availability[trainClass] !== undefined);
    let secondLegTrains = secondLeg.trains.filter(t => t.availability[trainClass] !== undefined);
    
    // Count trains with available seats
    const firstLegWithSeats = firstLegTrains.filter(t => hasAvailableSeats(t.availability[trainClass])).length;
    const secondLegWithSeats = secondLegTrains.filter(t => hasAvailableSeats(t.availability[trainClass])).length;

    console.log(`   ${hub}: ${firstLegTrains.length} (${firstLegWithSeats} available) + ${secondLegTrains.length} (${secondLegWithSeats} available) trains`);

    // Create combinations if both legs have trains with the selected class
    if (firstLegTrains.length > 0 && secondLegTrains.length > 0) {
      // Limit combinations to avoid too many results
      const maxFirstLeg = Math.min(firstLegTrains.length, 8);
      const maxSecondLeg = Math.min(secondLegTrains.length, 8);
      
      for (let i = 0; i < maxFirstLeg; i++) {
        for (let j = 0; j < maxSecondLeg; j++) {
          const firstTrain = firstLegTrains[i];
          const secondTrain = secondLegTrains[j];
          const totalDuration = calculateTotalDuration(firstTrain.duration, secondTrain.duration);
          const totalFare = (firstTrain.fare[trainClass] || 0) + (secondTrain.fare[trainClass] || 0);

          alternatives.push({
            type: "alternative",
            trains: [firstTrain, secondTrain],
            totalDuration,
            totalFare,
            hubStation: hub,
          });
        }
      }
    }
  }

  const sorted = alternatives.sort((a, b) => {
    // Prioritize routes with available seats
    const aHasSeats = a.trains.every(t => hasAvailableSeats(t.availability[trainClass]));
    const bHasSeats = b.trains.every(t => hasAvailableSeats(t.availability[trainClass]));
    
    if (aHasSeats && !bHasSeats) return -1;
    if (!aHasSeats && bHasSeats) return 1;
    
    // Then sort by duration
    const aDuration = parseDuration(a.totalDuration);
    const bDuration = parseDuration(b.totalDuration);
    return aDuration - bDuration;
  }).slice(0, 20);

  console.log(`✅ Found ${sorted.length} viable alternative routes`);
  return sorted;
};

// Search with intermediate stops
export const searchTrainsWithStops = async (
  stations: string[],
  date: Date,
  trainClass: string
): Promise<Route[]> => {
  const routes: Route[] = [];
  
  console.log(`\n🚂 Searching multi-leg route: ${stations.join(' → ')}`);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;

  // Search for trains between each consecutive pair of stations
  const legPromises = [];
  for (let i = 0; i < stations.length - 1; i++) {
    legPromises.push(fetchTrainsForRoute(stations[i], stations[i + 1], formattedDate));
  }

  const legResults = await Promise.all(legPromises);
  
  // Get all trains for each leg (even without seats)
  const allLegs = legResults.map((result, index) => {
    const allTrains = result.trains.filter(t => t.availability[trainClass] !== undefined);
    const trainsWithSeats = allTrains.filter(t => hasAvailableSeats(t.availability[trainClass]));
    
    console.log(`   Leg ${index + 1} (${stations[index]} → ${stations[index + 1]}): ${allTrains.length} trains total, ${trainsWithSeats.length} with available seats in ${trainClass}`);
    return allTrains.length > 0 ? allTrains : result.trains; // Fallback to all trains if no class-specific trains
  });

  // Check if all legs have trains
  if (allLegs.every(leg => leg.length > 0)) {
    // Generate combinations (limit to avoid too many results)
    const generateCombinations = (legs: Train[][], maxCombos: number = 20): Train[][] => {
      if (legs.length === 0) return [[]];
      if (legs.length === 1) return legs[0].slice(0, Math.min(10, legs[0].length)).map(t => [t]);
      
      const combinations: Train[][] = [];
      const firstLeg = legs[0].slice(0, Math.min(10, legs[0].length));
      
      for (const train of firstLeg) {
        const restCombinations = generateCombinations(legs.slice(1), Math.ceil(maxCombos / firstLeg.length));
        for (const combo of restCombinations) {
          combinations.push([train, ...combo]);
          if (combinations.length >= maxCombos) break;
        }
        if (combinations.length >= maxCombos) break;
      }
      
      return combinations;
    };

    const combinations = generateCombinations(allLegs, 30);
    
    combinations.forEach(trainCombo => {
      let totalDuration = trainCombo[0].duration;
      let totalFare = trainCombo[0].fare[trainClass] || 0;
      
      for (let i = 1; i < trainCombo.length; i++) {
        totalDuration = calculateTotalDuration(totalDuration, trainCombo[i].duration);
        totalFare += trainCombo[i].fare[trainClass] || 0;
      }
      
      routes.push({
        type: 'alternative',
        trains: trainCombo,
        totalDuration,
        totalFare,
        hubStation: stations.slice(1, -1).join(', ') || undefined
      });
    });
    
    // Sort by duration and prefer routes with available seats
    routes.sort((a, b) => {
      const aHasSeats = a.trains.every(t => hasAvailableSeats(t.availability[trainClass]));
      const bHasSeats = b.trains.every(t => hasAvailableSeats(t.availability[trainClass]));
      
      if (aHasSeats && !bHasSeats) return -1;
      if (!aHasSeats && bHasSeats) return 1;
      
      return parseDuration(a.totalDuration) - parseDuration(b.totalDuration);
    });
    
    console.log(`✅ Found ${routes.length} multi-leg route combinations`);
  } else {
    const missingLegs = allLegs.map((leg, i) => leg.length === 0 ? `${stations[i]} → ${stations[i + 1]}` : null).filter(Boolean);
    console.log(`⚠️ No trains found for: ${missingLegs.join(', ')}. Trying hub-based alternative routes...`);
    
    // If user-specified stops don't work, try hub stations
    const origin = stations[0];
    const destination = stations[stations.length - 1];
    const alternatives = await findAlternativeRoutes(origin, destination, date, trainClass);
    routes.push(...alternatives);
  }
  
  return routes;
};

// Main search function
export const searchTrains = async (
  from: string,
  to: string,
  stops: string[],
  date: Date,
  trainClass: string
): Promise<Route[]> => {
  try {
    // If stops are provided, use multi-leg search
    if (stops.length > 0) {
      const allStations = [from, ...stops, to];
      return await searchTrainsWithStops(allStations, date, trainClass);
    }

    // Otherwise, search for direct trains first
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    console.log(`\n🚂 Searching trains: ${from} → ${to} on ${formattedDate}, Class: ${trainClass}`);

    // Fetch direct trains
    const { trains: allTrains, trainsOnDate } = await fetchTrainsForRoute(from, to, formattedDate);

    console.log(`📊 Found ${allTrains.length} total trains, ${trainsOnDate.length} on selected date`);

    const routes: Route[] = [];

    // Add direct trains
    trainsOnDate.forEach((train: Train) => {
      routes.push({
        type: "direct",
        trains: [train],
        totalDuration: train.duration,
        totalFare: train.fare[trainClass] || 0,
      });
    });

    // Check if we need alternatives
    const directWithSeats = trainsOnDate.filter(t => hasAvailableSeats(t.availability[trainClass]));

    if (directWithSeats.length === 0) {
      if (trainsOnDate.length === 0) {
        console.log(`⚠️ No direct trains on ${formattedDate}. Searching alternatives...`);
      } else {
        console.log(`⚠️ No available seats in direct trains. Searching alternatives...`);
      }

      const alternatives = await findAlternativeRoutes(from, to, date, trainClass);
      routes.push(...alternatives);
    } else {
      console.log(`✅ Found ${directWithSeats.length} direct trains with available seats`);
    }

    console.log(`\n📋 Total routes: ${routes.length} (${directWithSeats.length} direct, ${routes.length - trainsOnDate.length} alternative)\n`);
    return routes;

  } catch (error) {
    console.error('❌ Search error:', error);

    // Try alternatives as fallback
    try {
      console.log('🔄 Attempting alternative route search...');
      const alternatives = await findAlternativeRoutes(from, to, date, trainClass);
      if (alternatives.length > 0) {
        return alternatives;
      }
    } catch (altError) {
      console.error('❌ Alternative search failed:', altError);
    }

    return [];
  }
};
