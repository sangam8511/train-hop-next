import { ExternalLink, Clock, IndianRupee, ArrowRight, CheckCircle2, AlertCircle, XCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Route } from "@/types/train";
import { INDIAN_STATIONS } from "@/data/stations";
import { classifyAvailability } from "@/lib/availability";

interface RouteCardProps {
  route: Route;
  trainClass: string;
}

export const RouteCard = ({ route, trainClass }: RouteCardProps) => {
  const getStationName = (code: string) => {
    return INDIAN_STATIONS.find((s) => s.code === code)?.name || code;
  };

  const handleBooking = (trainNumber: string) => {
    window.open(`https://www.irctc.co.in/nget/train-search`, "_blank");
  };

  const renderStatusBadge = (value: string | undefined) => {
    const status = classifyAvailability(value);
    const map = {
      available: { cls: "bg-success text-success-foreground", icon: CheckCircle2, label: value || "Available" },
      waitlist: { cls: "bg-accent text-accent-foreground", icon: AlertCircle, label: value || "Waitlist" },
      regret: { cls: "bg-destructive text-destructive-foreground", icon: XCircle, label: value || "Regret" },
      unknown: { cls: "bg-muted text-muted-foreground", icon: AlertCircle, label: value || "N/A" },
    } as const;
    const { cls, icon: Icon, label } = map[status];
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  };

  return (
    <Card className="p-4 sm:p-6 hover:shadow-card-hover transition-shadow duration-300 bg-gradient-card">
      {/* Route Type Badge */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Badge
          variant={route.type === "direct" ? "default" : "secondary"}
          className="text-xs font-semibold"
        >
          {route.type === "direct" ? "Direct Train" : "Alternative Route"}
        </Badge>
        {route.type === "alternative" && route.hubStation && (
          <span className="text-xs text-muted-foreground">
            via {getStationName(route.hubStation)}
          </span>
        )}
      </div>

      {/* Route Information */}
      <div className="space-y-4">
        {route.trains.map((train, index) => (
          <div key={`${train.number}-${index}`} className="space-y-3">
            {index > 0 && route.hubStation && (
              <div className="flex items-center gap-2 text-sm font-medium text-primary pl-4 py-2">
                <ArrowRight className="h-5 w-5" />
                <span>Change trains at {getStationName(route.hubStation)}</span>
              </div>
            )}

            <div className="bg-secondary/30 rounded-lg p-4">
              {/* Train Info */}
              <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">{train.name}</h3>
                  <p className="text-xs text-muted-foreground">#{train.number}</p>
                </div>
                {renderStatusBadge(train.availability[trainClass])}
              </div>

              {/* Journey Details */}
              <div className="flex items-center gap-3 text-sm mb-3">
                <div className="min-w-0">
                  <p className="font-bold text-base">{train.departureTime}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getStationName(train.from)}
                  </p>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{train.duration}</span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <div className="text-right min-w-0">
                  <p className="font-bold text-base">{train.arrivalTime}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getStationName(train.to)}
                  </p>
                </div>
              </div>

              {/* Multi-class fare comparison */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {["SL", "3A", "2A", "1A"].map((cls) => {
                  const avail = train.availability[cls];
                  const fare = train.fare[cls];
                  const status = classifyAvailability(avail);
                  if (!avail && !fare) return null;
                  const dotCls =
                    status === "available"
                      ? "bg-success"
                      : status === "waitlist"
                      ? "bg-accent"
                      : status === "regret"
                      ? "bg-destructive"
                      : "bg-muted-foreground/40";
                  return (
                    <div
                      key={cls}
                      className={`rounded-md border p-2 text-xs ${
                        cls === trainClass ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{cls}</span>
                        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {avail || "—"}
                      </div>
                      {fare > 0 && (
                        <div className="font-semibold text-foreground mt-0.5">₹{fare}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total Summary */}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{route.totalDuration}</span>
          </div>
          {route.totalFare > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="font-bold text-lg text-primary">{route.totalFare}</span>
              <span className="text-xs text-muted-foreground">({trainClass})</span>
            </div>
          )}
          {route.trains.length > 1 && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {route.trains.length} legs
            </span>
          )}
        </div>

        <Button
          variant="accent"
          onClick={() => handleBooking(route.trains[0].number)}
          className="group"
        >
          Book on IRCTC
          <ExternalLink className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </Card>
  );
};
