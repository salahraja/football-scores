import { useState, useEffect } from "react";
import type { NextPage } from "next";

const API_KEY = "2ae54ef8c4msh36db11fd19d265dp115741jsn731299f42bf5";
const API_HOST = "footapi7.p.rapidapi.com";
const TOURNAMENT_ID = 17;
const SEASON_ID = 41886;

type Event = {
  id: number;
  homeScore: {
    current: number;
  };
  homeTeam: {
    name: string;
    id: number;
  };
  awayScore: {
    current: number;
  };
  awayTeam: {
    name: string;
    id: number;
  };
  status: {
    type: string;
  };
  roundInfo: {
    round: number;
  };
};

const Home: NextPage = () => {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const options = {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": API_KEY,
          "X-RapidAPI-Host": API_HOST,
        },
      };

      const res = await fetch(
        `https://footapi7.p.rapidapi.com/api/tournament/23/season/42415/matches/last/0`,
        options
      );

      const data = await res.json();

      setEvents(data.events);
    };

    fetchData();
  }, []);

  return (
    <div className="container mx-auto">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 text-whi">
        {events.map((event) => (
          <div
            key={event.id}
            className="from-white via-white dark:from-black dark:via-black rounded-lg shadow-md p-4"
          >
            <div className="text-center">
              <p className="text-gray-500">{event.status.type}</p>
            </div>
            <div className="flex justify-between items-center mt-4">
              <div>
                <h2 className="text-4xl font-bold">
                  {event.homeScore.current}
                </h2>
                <h3 className="text-lg font-medium">{event.homeTeam.name}</h3>
                <p>{event.homeTeam.id}</p>
              </div>
              <span className="text-2xl font-bold">vs</span>
              <div>
                <h2 className="text-4xl font-bold">
                  {event.awayScore.current}
                </h2>
                <h3 className="text-lg font-medium">{event.awayTeam.name}</h3>
                <p>{event.awayTeam.id}</p>
              </div>
            </div>
            <div className="text-center mt-4">
              <p className="text-gray-500">
                Matchday &nbsp; {event.roundInfo.round}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
