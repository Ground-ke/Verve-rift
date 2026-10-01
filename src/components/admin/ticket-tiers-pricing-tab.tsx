import { useState, useEffect } from "react";
import {
  Tag,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Save,
  Check,
  AlertCircle,
  Users,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAdminAuth } from "@/lib/auth/admin-auth-context";
import { toast } from "sonner";

export interface TicketTier {
  id: string;
  slug: string;
  name: string;
  priceKes: number;
  admitsCount: number;
  totalInventory: number | null;
  soldCount?: number | null;
  active: boolean;
}

const DEFAULT_TIERS: TicketTier[] = [
  {
    id: "00000000-0000-0000-0000-000000000011",
    slug: "early-bird",
    name: "Early Bird",
    priceKes: 1000,
    admitsCount: 1,
    totalInventory: null,
    soldCount: null,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    slug: "couple-pass",
    name: "Couple Pass",
    priceKes: 1800,
    admitsCount: 2,
    totalInventory: null,
    soldCount: null,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000013",
    slug: "group-of-four",
    name: "Group of Four",
    priceKes: 3200,
    admitsCount: 4,
    totalInventory: null,
    soldCount: null,
    active: true,
  },
];

export function TicketTiersPricingTab() {
  const { user } = useAdminAuth();
  const [tiers, setTiers] = useState<TicketTier[]>(DEFAULT_TIERS);
  const [isLoading, setIsLoading] = useState(false);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  // New Tier Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newAdmits, setNewAdmits] = useState("1");
  const [newInventory, setNewInventory] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch current tiers from server
  const fetchTiers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/ticket-tiers");
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.tiers)) {
        throw new Error(data.message || "Failed to load ticket tiers.");
      }
      setTiers(data.tiers);
    } catch (err) {
      console.error("Could not load ticket tiers:", err);
      setTiers([]);
      toast.error("Ticket tiers could not be loaded from the server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const handleFieldChange = (
    slug: string,
    field: keyof TicketTier,
    value: string | number | boolean | null,
  ) => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.slug !== slug) return t;
        return {
          ...t,
          [field]: value,
        };
      }),
    );
  };

  const handleSaveTier = async (tier: TicketTier) => {
    setSavingSlug(tier.slug);
    try {
      const res = await fetch("/api/admin/ticket-tiers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: tier.slug,
          name: tier.name,
          priceKes: tier.priceKes,
          admitsCount: tier.admitsCount,
          totalInventory: tier.totalInventory,
          active: tier.active,
          actorEmail: user?.email || "admin@verve.co.ke",
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Updated "${tier.name}"`, {
          description: `Price set to KES ${tier.priceKes.toLocaleString()} (${tier.admitsCount} guest${tier.admitsCount > 1 ? "s" : ""})`,
        });
      } else {
        toast.error(data.message || "Failed to update ticket tier");
      }
    } catch (err) {
      console.error("Could not save ticket tier:", err);
      toast.error("Ticket tier was not saved. Check the server connection and try again.");
    } finally {
      setSavingSlug(null);
    }
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlug.trim() || !newName.trim()) {
      toast.error("Please provide both a tier slug and name.");
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        slug: newSlug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-"),
        name: newName.trim(),
        priceKes: Math.max(0, Number(newPrice) || 0),
        admitsCount: Math.max(1, Number(newAdmits) || 1),
        totalInventory: newInventory.trim() ? Number(newInventory) : null,
        actorEmail: user?.email || "admin@verve.co.ke",
      };

      const res = await fetch("/api/admin/ticket-tiers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.tier) {
        setTiers((prev) => [...prev, data.tier]);
        toast.success(`Created tier "${data.tier.name}"`, {
          description: `Price: KES ${data.tier.priceKes.toLocaleString()}`,
        });
        setShowAddForm(false);
        setNewSlug("");
        setNewName("");
        setNewPrice("");
        setNewAdmits("1");
        setNewInventory("");
      } else {
        toast.error(data.message || "Failed to create tier.");
      }
    } catch (err) {
      toast.error("Could not reach tier creation endpoint.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border border-border bg-card/70 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="w-6 h-6 text-amber-400" />
            <h2 className="font-display text-2xl text-bone tracking-wide">
              Ticket Tiers &amp; Pricing Management
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Authoritatively modify ticket tier names, admission pricing (KES), guest capacity per
            pass, and activate or pause tiers in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTiers}
            disabled={isLoading}
            className="border-border text-lavender hover:text-bone text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-oxblood text-bone hover:bg-oxblood/90 border border-amber-500/30 text-xs h-9"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {showAddForm ? "Close Form" : "Add Ticket Tier"}
          </Button>
        </div>
      </div>

      {/* Add New Tier Drawer / Card */}
      {showAddForm && (
        <div className="border border-amber-500/40 bg-card p-6 shadow-xl space-y-4 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <h3 className="font-display text-lg text-bone flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Configure New Admission Tier
            </h3>
            <span className="text-xs font-mono text-muted-foreground uppercase">
              Authoritative Catalog Entry
            </span>
          </div>

          <form onSubmit={handleCreateTier} className="grid gap-4 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">
                Tier Slug (Unique ID)
              </Label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. vip-pass"
                className="bg-background border-border text-bone text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-mono text-muted-foreground uppercase">
                Display Name
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. VIP Red Carpet Pass"
                className="bg-background border-border text-bone text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">
                Price (KES)
              </Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="2500"
                className="bg-background border-border text-amber-400 font-mono text-xs font-bold"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">
                Admits Count
              </Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={newAdmits}
                onChange={(e) => setNewAdmits(e.target.value)}
                placeholder="1"
                className="bg-background border-border text-bone font-mono text-xs"
                required
              />
            </div>

            <div className="sm:col-span-5 flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreating}
                className="bg-emerald-600 hover:bg-emerald-500 text-bone text-xs font-mono px-4"
              >
                {isCreating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1" />
                )}
                Save New Tier to Catalog
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Ticket Tiers List */}
      <div className="grid gap-4">
        {tiers.map((tier) => {
          const isSaving = savingSlug === tier.slug;

          return (
            <div
              key={tier.slug}
              className={`border p-6 transition-all duration-200 ${
                tier.active
                  ? "border-border bg-card/90 hover:border-amber-500/40"
                  : "border-border/40 bg-card/40 opacity-75"
              }`}
            >
              <div className="grid gap-6 md:grid-cols-12 items-center">
                {/* Left: Identifier & Status */}
                <div className="md:col-span-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono uppercase tracking-widest ${
                        tier.active
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-950/20"
                          : "border-border text-muted-foreground bg-muted/20"
                      }`}
                    >
                      {tier.active ? "Active" : "Paused"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">#{tier.slug}</span>
                  </div>
                  <h3 className="font-display text-xl text-bone">{tier.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Admits {tier.admitsCount} guest{tier.admitsCount > 1 ? "s" : ""} per pass
                  </p>
                </div>

                {/* Middle: Live Edit Controls */}
                <div className="md:col-span-7 grid gap-4 sm:grid-cols-3">
                  {/* Name Edit */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-mono text-muted-foreground uppercase">
                      Tier Name
                    </Label>
                    <Input
                      value={tier.name}
                      onChange={(e) => handleFieldChange(tier.slug, "name", e.target.value)}
                      className="bg-background/80 border-border text-bone text-xs"
                    />
                  </div>

                  {/* Price Edit */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-mono text-muted-foreground uppercase flex items-center justify-between">
                      <span>Price (KES)</span>
                      <span className="text-amber-400 font-bold">KES</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="50"
                      value={tier.priceKes}
                      onChange={(e) =>
                        handleFieldChange(tier.slug, "priceKes", Number(e.target.value))
                      }
                      className="bg-background/80 border-border text-amber-300 font-mono text-sm font-bold"
                    />
                  </div>

                  {/* Admits Count Edit */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-mono text-muted-foreground uppercase">
                      Admits Count
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={tier.admitsCount}
                      onChange={(e) =>
                        handleFieldChange(tier.slug, "admitsCount", Number(e.target.value))
                      }
                      className="bg-background/80 border-border text-bone font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="md:col-span-2 flex flex-col gap-2 justify-end">
                  <Button
                    size="sm"
                    onClick={() => handleSaveTier(tier)}
                    disabled={isSaving}
                    className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono h-9"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newActive = !tier.active;
                      handleFieldChange(tier.slug, "active", newActive);
                      handleSaveTier({ ...tier, active: newActive });
                    }}
                    className="text-xs text-muted-foreground hover:text-bone h-8"
                  >
                    {tier.active ? (
                      <>
                        <ToggleRight className="w-4 h-4 mr-1 text-emerald-400" />
                        Active on Site
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 mr-1 text-muted-foreground" />
                        Paused
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Card */}
      <div className="border border-border/60 bg-card/40 p-4 text-xs font-mono text-muted-foreground flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-bone font-semibold">Pricing Synchronization Note:</p>
          <p>
            When ticket prices are modified here, changes take effect immediately across the public
            checkout flow and M-Pesa amount verification. Existing active reservations will honor
            their locked snapshot until their 10-minute hold expires.
          </p>
        </div>
      </div>
    </div>
  );
}
