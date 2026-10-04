import { Check, Copy, Instagram, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const text =
  "I’m going to Hauntings of the Rift! 31 October • Top Cliff Lodge, Nakuru. Are you coming?";

export function ShareActions() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: "Hauntings of the Rift", text, url });
    else
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
  };
  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="event" size="xl" onClick={share}>
        <MessageCircle /> WhatsApp
      </Button>
      <Button variant="spectral" size="xl" onClick={copy}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
      <Button
        variant="spectral"
        size="icon"
        className="min-h-12 min-w-12"
        aria-label="Visit on Instagram"
        onClick={() =>
          window.open(
            "https://www.instagram.com/theverveandco?utm_source=ig_web_button_share_sheet&stkn=ZDNlZDc0MzIxNw==",
            "_blank",
            "noopener,noreferrer",
          )
        }
      >
        <Instagram />
      </Button>
      <Button
        variant="spectral"
        size="icon"
        className="min-h-12 min-w-12"
        aria-label="Open share menu"
        onClick={share}
      >
        <Share2 />
      </Button>
    </div>
  );
}
