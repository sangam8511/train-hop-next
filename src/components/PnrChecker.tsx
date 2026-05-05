import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Ticket, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const PnrChecker = () => {
  const [open, setOpen] = useState(false);
  const [pnr, setPnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheck = async () => {
    if (!/^\d{10}$/.test(pnr)) {
      toast.error("Please enter a valid 10-digit PNR");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-pnr", {
        body: { pnr },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data?.data ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check PNR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Ticket className="h-4 w-4" />
          Check PNR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Check PNR Status</DialogTitle>
          <DialogDescription>
            Enter your 10-digit PNR number to view current booking status.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            placeholder="1234567890"
            maxLength={10}
            value={pnr}
            onChange={(e) => setPnr(e.target.value.replace(/\D/g, ""))}
          />
          <Button onClick={handleCheck} disabled={loading || pnr.length !== 10}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
          </Button>
        </div>

        {result && (
          <div className="mt-2 rounded-lg border border-border p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
            {result.TrainNo && (
              <div className="font-semibold">
                {result.TrainName} (#{result.TrainNo})
              </div>
            )}
            {result.Doj && (
              <div className="text-muted-foreground">Date of Journey: {result.Doj}</div>
            )}
            {result.From && result.To && (
              <div className="text-muted-foreground">
                {result.From} → {result.To}
              </div>
            )}
            {Array.isArray(result.PassengerStatus) && result.PassengerStatus.length > 0 && (
              <div className="space-y-1 mt-2">
                <div className="font-medium">Passengers</div>
                {result.PassengerStatus.map((p: any, i: number) => (
                  <div
                    key={i}
                    className="flex justify-between bg-muted/40 rounded px-2 py-1"
                  >
                    <span>Passenger {i + 1}</span>
                    <span className="font-medium">
                      {p.CurrentStatus || p.Status || p.BookingStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!result.TrainNo && (
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};