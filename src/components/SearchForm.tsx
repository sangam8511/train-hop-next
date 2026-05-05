import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Search, ArrowLeftRight, Plus, GripVertical, X, History, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { INDIAN_STATIONS, TRAIN_CLASSES } from "@/data/stations";
import type { SearchParams } from "@/types/train";
import {
  loadRecentSearches,
  clearRecentSearches,
  toSearchParams,
  type StoredSearch,
} from "@/lib/recentSearches";

interface SearchFormProps {
  onSearch: (params: SearchParams) => void;
  isLoading?: boolean;
}

const SearchForm = ({ onSearch, isLoading = false }: SearchFormProps) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stops, setStops] = useState<string[]>([]);
  const [date, setDate] = useState<Date>();
  const [trainClass, setTrainClass] = useState("SL");
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);
  const [openStops, setOpenStops] = useState<{ [key: number]: boolean }>({});
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [recent, setRecent] = useState<StoredSearch[]>([]);

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, []);

  const handleSwap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
    // Reverse stops order when swapping
    setStops([...stops].reverse());
  };

  const addStop = () => {
    setStops([...stops, ""]);
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
    const newOpenStops = { ...openStops };
    delete newOpenStops[index];
    setOpenStops(newOpenStops);
  };

  const updateStop = (index: number, value: string) => {
    const newStops = [...stops];
    newStops[index] = value;
    setStops(newStops);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStops = [...stops];
    const draggedItem = newStops[draggedIndex];
    newStops.splice(draggedIndex, 1);
    newStops.splice(index, 0, draggedItem);
    
    setStops(newStops);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (from && to && date) {
      const validStops = stops.filter(stop => stop !== "");
      onSearch({ from, to, stops: validStops, date, class: trainClass });
    }
  };

  const getStationName = (code: string) => {
    return INDIAN_STATIONS.find((s) => s.code === code)?.name || code;
  };

  const handleSelectRecent = (s: StoredSearch) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stored = new Date(s.date);
    const useDate = stored < today ? today : stored;
    setFrom(s.from);
    setTo(s.to);
    setStops(s.stops);
    setDate(useDate);
    setTrainClass(s.class);
    onSearch({ ...toSearchParams(s), date: useDate });
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecent([]);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-2xl shadow-search p-6 md:p-8 border border-border/50 max-w-4xl mx-auto"
    >
      <div className="space-y-4">
        {/* Origin Station */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-success border-2 border-background shadow-sm"></div>
            <span className="text-xs font-semibold text-foreground/70 bg-background/80 px-2 py-0.5 rounded-md">FROM</span>
          </div>
          <Popover open={openFrom} onOpenChange={setOpenFrom}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-start text-left font-normal pl-24 h-14 text-base hover:bg-accent/50 transition-colors bg-background"
              >
                {from ? getStationName(from) : <span className="text-muted-foreground">Select origin station</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Search station..." />
                <CommandList>
                  <CommandEmpty>No station found.</CommandEmpty>
                  <CommandGroup>
                    {INDIAN_STATIONS.map((station) => (
                      <CommandItem
                        key={station.code}
                        value={`${station.name} ${station.code}`}
                        onSelect={() => {
                          setFrom(station.code);
                          setOpenFrom(false);
                        }}
                      >
                        {station.name} ({station.code})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Intermediate Stops */}
        {stops.map((stop, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              "relative transition-all",
              draggedIndex === index && "opacity-50 scale-95"
            )}
          >
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pointer-events-none">
              <GripVertical className="w-4 h-4 text-foreground/50 cursor-grab active:cursor-grabbing pointer-events-auto" />
              <div className="w-3 h-3 rounded-full bg-accent border-2 border-background shadow-sm"></div>
              <span className="text-xs font-semibold text-foreground/70 bg-background/80 px-2 py-0.5 rounded-md">STOP {index + 1}</span>
            </div>
            <div className="flex gap-2">
              <Popover 
                open={openStops[index]} 
                onOpenChange={(open) => setOpenStops({ ...openStops, [index]: open })}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="flex-1 justify-start text-left font-normal pl-32 h-14 text-base hover:bg-accent/50 transition-colors bg-background"
                  >
                    {stop ? getStationName(stop) : <span className="text-muted-foreground">Add intermediate station</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search station..." />
                    <CommandList>
                      <CommandEmpty>No station found.</CommandEmpty>
                      <CommandGroup>
                        {INDIAN_STATIONS.map((station) => (
                          <CommandItem
                            key={station.code}
                            value={`${station.name} ${station.code}`}
                            onSelect={() => {
                              updateStop(index, station.code);
                              setOpenStops({ ...openStops, [index]: false });
                            }}
                          >
                            {station.name} ({station.code})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeStop(index)}
                className="h-14 w-14 hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}

        {/* Add Stop Button */}
        {stops.length < 3 && (
          <Button
            type="button"
            variant="outline"
            onClick={addStop}
            className="w-full h-12 border-dashed hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add intermediate stop (optional)
          </Button>
        )}

        {/* Destination Station */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-destructive border-2 border-background shadow-sm"></div>
            <span className="text-xs font-semibold text-foreground/70 bg-background/80 px-2 py-0.5 rounded-md">TO</span>
          </div>
          <Popover open={openTo} onOpenChange={setOpenTo}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-start text-left font-normal pl-24 h-14 text-base hover:bg-accent/50 transition-colors bg-background"
              >
                {to ? getStationName(to) : <span className="text-muted-foreground">Select destination station</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Search station..." />
                <CommandList>
                  <CommandEmpty>No station found.</CommandEmpty>
                  <CommandGroup>
                    {INDIAN_STATIONS.map((station) => (
                      <CommandItem
                        key={station.code}
                        value={`${station.name} ${station.code}`}
                        onSelect={() => {
                          setTo(station.code);
                          setOpenTo(false);
                        }}
                      >
                        {station.name} ({station.code})
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSwap}
            disabled={!from && !to}
            className="hover:bg-primary hover:text-primary-foreground transition-all"
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Swap route
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {/* Journey Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Journey Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12 bg-background",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(date) =>
                  date < new Date(new Date().setHours(0, 0, 0, 0))
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Train Class */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Class</label>
          <Select value={trainClass} onValueChange={setTrainClass}>
            <SelectTrigger className="w-full h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAIN_CLASSES.map((cls) => (
                <SelectItem key={cls.code} value={cls.code}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search Button */}
      <Button
        type="submit"
        className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-lg hover:shadow-xl transition-all"
        disabled={!from || !to || !date || isLoading}
      >
        {isLoading ? (
          <>
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Searching routes...
          </>
        ) : (
          <>
            <Search className="mr-2 h-5 w-5" />
            Find Best Routes
          </>
        )}
      </Button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Recent searches
            </div>
            <button
              type="button"
              onClick={handleClearRecent}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectRecent(s)}
                className="text-xs bg-secondary hover:bg-secondary/70 transition-colors rounded-full px-3 py-1.5 border border-border"
              >
                <span className="font-semibold">{getStationName(s.from)}</span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-semibold">{getStationName(s.to)}</span>
                <span className="ml-2 text-muted-foreground">{s.class}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
};

export { SearchForm };
