import { createFileRoute } from "@tanstack/react-router";
import { PartyRoom } from "../../../../party/PartyRoom";

export const Route = createFileRoute("/_app/play/party/$id")({
  component: Party,
});

function Party() {
  const { id } = Route.useParams();
  return <PartyRoom key={id} partyId={id} />;
}
