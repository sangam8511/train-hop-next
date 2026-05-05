import { useState, useMemo } from "react";
import { Train, Zap, Shield, Clock, Filter, Sparkles, Lightbulb, Wand2, ArrowDownUp } from "lucide-react";
import { SearchForm } from "@/components/SearchForm";
import { RouteCard } from "@/components/RouteCard";
import { SearchParams, Route, Train as TrainType } from "@/types/train";
import { searchTrains } from "@/utils/trainApi";
import { INDIAN_STATIONS } from "@/data/stations";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-train.jpg";
import { PnrChecker } from "@/components/PnrChecker";
import { saveRecentSearch } from "@/lib/recentSearches";
import {
  classifyAvailability,
  parseDurationMinutes,
  timeOfDayBucket,
} from "@/lib/availability";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortKey = "ai" | "duration" | "fare" | "departure" | "availability";
type DepartFilter = "any" | "early" | "morning" | "afternoon" | "evening" | "night";

interface AIRecommendation {
  recommendedIndex: number;
  reason: string;
  tips: string[];
}

const Index = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<SearchParams | null>(null);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "direct" | "alternative">("all");
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("ai");
  const [departFilter, setDepartFilter] = useState<DepartFilter>("any");

  // Find best routes using AI
  const handleFindBestRoutes = async () => {
    if (!searchParams) {
      toast.error("Please search for routes first");
      return;
    }

    setIsLoadingAI(true);
    setAiRecommendation(null);

    try {
      const day = String(searchParams.date.getDate()).padStart(2, '0');
      const month = String(searchParams.date.getMonth() + 1).padStart(2, '0');
      const year = searchParams.date.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      toast.info("AI is searching for the best routes via multiple stations...");

      const { data, error } = await supabase.functions.invoke('recommend-route', {
        body: { 
          from: searchParams.from,
          to: searchParams.to,
          date: formattedDate,
          trainClass: searchParams.class,
          findBestRoutes: true
        }
      });

      if (error) {
        console.error("AI search error:", error);
        toast.error("Failed to find best routes");
        return;
      }

      if (data?.success) {
        // Convert AI routes to our Route format
        if (data.routes && data.routes.length > 0) {
          const convertedRoutes: Route[] = data.routes.map((r: any) => ({
            type: r.type,
            trains: r.trains.map((t: any) => ({
              number: t.trainNumber,
              name: t.trainName,
              from: t.source,
              to: t.destination,
              departureTime: t.departureTime,
              arrivalTime: t.arrivalTime,
              duration: t.duration,
              availability: t.availability,
              fare: t.fare
            })),
            totalDuration: r.totalDuration,
            totalFare: r.totalFare,
            hubStation: r.viaStation
          }));

          setRoutes(convertedRoutes);
          setActiveTab("all");
          toast.success(`Found ${convertedRoutes.length} optimized routes sorted by duration!`);
        }

        if (data.recommendation) {
          setAiRecommendation(data.recommendation);
        }
      }
    } catch (error) {
      console.error("Failed to find best routes:", error);
      toast.error("Failed to search for best routes");
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleSearch = async (params: SearchParams) => {
    setIsLoading(true);
    setSearchParams(params);
    setRoutes([]);
    setAiRecommendation(null);

    try {
      const results = await searchTrains(params.from, params.to, params.stops, params.date, params.class);
      setRoutes(results);
      saveRecentSearch(params);

      if (results.length === 0) {
        toast.error("No trains found for the selected route and class");
      } else {
        const routeType = params.stops.length > 0 ? 'multi-leg' : results[0]?.type === 'direct' ? 'direct and alternative' : 'alternative';
        toast.success(`Found ${results.length} ${routeType} route${results.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error("Search error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch train routes. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getStationName = (code: string) => {
    return INDIAN_STATIONS.find((s) => s.code === code)?.name || code;
  };

  // Helper to check if route has available seats
  const hasAvailableSeats = (route: Route, trainClass: string): boolean => {
    return route.trains.every(
      (train) => classifyAvailability(train.availability[trainClass]) === "available"
    );
  };

  const filteredRoutes = useMemo(() => {
    if (!searchParams) return [];
    let filtered = [...routes];

    if (activeTab === "direct") {
      filtered = filtered.filter((r) => r.type === "direct");
    } else if (activeTab === "alternative") {
      filtered = filtered.filter((r) => r.type === "alternative");
    }

    if (showOnlyAvailable) {
      filtered = filtered.filter((r) => hasAvailableSeats(r, searchParams.class));
    }

    if (departFilter !== "any") {
      filtered = filtered.filter(
        (r) => timeOfDayBucket(r.trains[0]?.departureTime) === departFilter
      );
    }

    if (sortBy !== "ai") {
      filtered.sort((a, b) => {
        if (sortBy === "duration") {
          return parseDurationMinutes(a.totalDuration) - parseDurationMinutes(b.totalDuration);
        }
        if (sortBy === "fare") {
          const af = a.totalFare || Number.MAX_SAFE_INTEGER;
          const bf = b.totalFare || Number.MAX_SAFE_INTEGER;
          return af - bf;
        }
        if (sortBy === "departure") {
          const at = a.trains[0]?.departureTime || "99:99";
          const bt = b.trains[0]?.departureTime || "99:99";
          return at.localeCompare(bt);
        }
        if (sortBy === "availability") {
          const ah = hasAvailableSeats(a, searchParams.class) ? 0 : 1;
          const bh = hasAvailableSeats(b, searchParams.class) ? 0 : 1;
          if (ah !== bh) return ah - bh;
          return parseDurationMinutes(a.totalDuration) - parseDurationMinutes(b.totalDuration);
        }
        return 0;
      });
    }

    return filtered;
  }, [routes, searchParams, activeTab, showOnlyAvailable, departFilter, sortBy]);

  const directCount = routes.filter(r => r.type === "direct").length;
  const alternativeCount = routes.filter(r => r.type === "alternative").length;
  const availableCount = routes.filter(r => searchParams && hasAvailableSeats(r, searchParams.class)).length;

  // Get the recommended route for highlighting (only meaningful with default sort)
  const getRecommendedRouteIndex = () => {
    if (!aiRecommendation || activeTab !== "all" || sortBy !== "ai") return -1;
    return aiRecommendation.recommendedIndex;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground overflow-hidden">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/10" />
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Train className="h-12 w-12" />
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold">
                RailRoute Finder
              </h1>
            </div>
            <p className="text-lg md:text-xl opacity-90 mb-2">
              Find the best train routes with real-time availability
            </p>
            <p className="text-sm md:text-base opacity-80">
              AI-powered recommendations • Direct trains or smart alternatives
            </p>
            <div className="mt-5 flex items-center justify-center">
              <PnrChecker />
            </div>
          </div>

          {/* Search Form */}
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/20 hover:bg-white/15 transition-all">
              <Zap className="h-10 w-10 mx-auto mb-3 text-yellow-300" />
              <h3 className="font-bold text-lg mb-2">Real-Time Data</h3>
              <p className="text-sm opacity-90">Live seat availability and updated schedules</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/20 hover:bg-white/15 transition-all">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-purple-300" />
              <h3 className="font-bold text-lg mb-2">AI Recommendations</h3>
              <p className="text-sm opacity-90">Smart route suggestions powered by AI</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/20 hover:bg-white/15 transition-all">
              <Clock className="h-10 w-10 mx-auto mb-3 text-blue-300" />
              <h3 className="font-bold text-lg mb-2">Fast & Easy</h3>
              <p className="text-sm opacity-90">Quick search, instant booking links</p>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {(routes.length > 0 || isLoading) && (
        <section className="container mx-auto px-4 py-12">
          {isLoading ? (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="text-center mb-8">
                <div className="inline-flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <div className="text-lg font-semibold">Searching for the best routes...</div>
                  <div className="text-sm text-muted-foreground">
                    Finding optimal routes with available seats...
                  </div>
                </div>
              </div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-card rounded-xl p-6 shadow-card animate-pulse"
                >
                  <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
                  <div className="h-6 bg-muted rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {searchParams && (
                <>
                  <div className="mb-6 text-center">
                    <h2 className="text-2xl md:text-3xl font-bold mb-2">
                      {getStationName(searchParams.from)}
                      {searchParams.stops.length > 0 && (
                        <span className="text-muted-foreground mx-2">
                          → {searchParams.stops.map(getStationName).join(' → ')} →
                        </span>
                      )}
                      {searchParams.stops.length === 0 && ' → '}
                      {getStationName(searchParams.to)}
                    </h2>
                    <p className="text-muted-foreground">
                      {searchParams.date.toLocaleDateString("en-IN", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      {" • "}
                      Class: {searchParams.class}
                      {searchParams.stops.length > 0 && ` • ${searchParams.stops.length} stop${searchParams.stops.length > 1 ? 's' : ''}`}
                    </p>
                  </div>

                  {/* AI Recommendation Banner */}
                  {(isLoadingAI || aiRecommendation) && (
                    <div className="mb-6">
                      {isLoadingAI ? (
                        <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-purple-500/20">
                          <div className="flex items-center gap-3">
                            <div className="animate-pulse">
                              <Sparkles className="h-5 w-5 text-purple-500" />
                            </div>
                            <span className="text-sm text-muted-foreground">AI is analyzing routes for the best recommendation...</span>
                          </div>
                        </div>
                      ) : aiRecommendation && (
                        <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-purple-500/30 shadow-lg">
                          <div className="flex items-start gap-3">
                            <div className="bg-purple-500/20 rounded-full p-2 flex-shrink-0">
                              <Sparkles className="h-5 w-5 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-purple-900 dark:text-purple-100">AI Recommendation</h3>
                                <span className="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                  Route #{aiRecommendation.recommendedIndex + 1}
                                </span>
                              </div>
                              <p className="text-sm text-foreground/80 mb-2">
                                {aiRecommendation.reason}
                              </p>
                              {aiRecommendation.tips && aiRecommendation.tips.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {aiRecommendation.tips.map((tip, i) => (
                                    <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded">
                                      <Lightbulb className="h-3 w-3" />
                                      {tip}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Find Best Routes Button */}
                  <div className="mb-6">
                    <Button
                      onClick={handleFindBestRoutes}
                      disabled={isLoadingAI}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg"
                      size="lg"
                    >
                      {isLoadingAI ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          AI is searching for best routes...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-5 w-5 mr-2" />
                          Find Best Routes (AI-Powered)
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      AI will search via multiple hub stations to find the lowest duration routes
                    </p>
                  </div>

                  {/* Filters & Sort */}
                  <div className="mb-6 bg-card rounded-xl p-4 border border-border/50 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Filter className="h-5 w-5 text-muted-foreground" />
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="available-only"
                            checked={showOnlyAvailable}
                            onCheckedChange={setShowOnlyAvailable}
                          />
                          <Label htmlFor="available-only" className="cursor-pointer text-sm">
                            Available only ({availableCount})
                          </Label>
                        </div>
                        <Select value={departFilter} onValueChange={(v) => setDepartFilter(v as DepartFilter)}>
                          <SelectTrigger className="h-9 w-[180px]">
                            <SelectValue placeholder="Departure time" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any time</SelectItem>
                            <SelectItem value="early">Early (00–06)</SelectItem>
                            <SelectItem value="morning">Morning (06–12)</SelectItem>
                            <SelectItem value="afternoon">Afternoon (12–17)</SelectItem>
                            <SelectItem value="evening">Evening (17–21)</SelectItem>
                            <SelectItem value="night">Night (21–24)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                            <SelectTrigger className="h-9 w-[180px]">
                              <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ai">Recommended</SelectItem>
                              <SelectItem value="availability">Availability</SelectItem>
                              <SelectItem value="duration">Shortest duration</SelectItem>
                              <SelectItem value="fare">Lowest fare</SelectItem>
                              <SelectItem value="departure">Earliest departure</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {filteredRoutes.length} of {routes.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                      <TabsTrigger value="all">
                        All Routes ({routes.length})
                      </TabsTrigger>
                      <TabsTrigger value="direct">
                        Direct Trains ({directCount})
                      </TabsTrigger>
                      <TabsTrigger value="alternative">
                        Alternative Routes ({alternativeCount})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="space-y-6">
                      {filteredRoutes.length > 0 ? (
                        filteredRoutes.map((route, index) => {
                          const originalIndex = routes.indexOf(route);
                          const isRecommended = originalIndex === getRecommendedRouteIndex();
                          return (
                            <div key={index} className="relative">
                              {isRecommended && (
                                <div className="absolute -top-3 left-4 z-10">
                                  <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                    <Sparkles className="h-3 w-3" />
                                    AI Recommended
                                  </span>
                                </div>
                              )}
                              <div className={isRecommended ? "ring-2 ring-purple-500/50 rounded-xl" : ""}>
                                <RouteCard
                                  route={route}
                                  trainClass={searchParams.class}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12 bg-card rounded-xl border border-border">
                          <Train className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <h3 className="text-lg font-semibold mb-2">No routes found</h3>
                          <p className="text-muted-foreground">
                            {showOnlyAvailable 
                              ? "No routes with available seats. Try turning off the 'Available only' filter."
                              : "Try adjusting your search parameters."}
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="direct" className="space-y-6">
                      {filteredRoutes.length > 0 ? (
                        filteredRoutes.map((route, index) => (
                          <RouteCard
                            key={index}
                            route={route}
                            trainClass={searchParams.class}
                          />
                        ))
                      ) : (
                        <div className="text-center py-12 bg-card rounded-xl border border-border">
                          <Train className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <h3 className="text-lg font-semibold mb-2">No direct trains found</h3>
                          <p className="text-muted-foreground">
                            {showOnlyAvailable 
                              ? "No direct trains with available seats for this route."
                              : directCount === 0 
                              ? "No direct trains available for this route. Check alternative routes."
                              : "Try turning off the 'Available only' filter."}
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="alternative" className="space-y-6">
                      {filteredRoutes.length > 0 ? (
                        filteredRoutes.map((route, index) => (
                          <RouteCard
                            key={index}
                            route={route}
                            trainClass={searchParams.class}
                          />
                        ))
                      ) : (
                        <div className="text-center py-12 bg-card rounded-xl border border-border">
                          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <h3 className="text-lg font-semibold mb-2">No alternative routes found</h3>
                          <p className="text-muted-foreground">
                            {showOnlyAvailable 
                              ? "No alternative routes with available seats."
                              : alternativeCount === 0
                              ? "No alternative routes found for this journey."
                              : "Try turning off the 'Available only' filter."}
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {!isLoading && routes.length === 0 && !searchParams && (
        <section className="container mx-auto px-4 py-16 text-center">
          <div className="max-w-md mx-auto">
            <Train className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Start Your Journey</h3>
            <p className="text-muted-foreground">
              Enter your travel details above to find the best train routes
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            RailRoute Finder • AI-powered train route recommendations
          </p>
          <p className="mt-2">
            Book your tickets directly on{" "}
            <a
              href="https://www.irctc.co.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              IRCTC
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
