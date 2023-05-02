import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import {
  Key,
  ReactElement,
  JSXElementConstructor,
  ReactFragment,
  ReactPortal,
} from "react";

export const getStaticProps = async () => {
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": "2ae54ef8c4msh36db11fd19d265dp115741jsn731299f42bf5",
      "X-RapidAPI-Host": "footapi7.p.rapidapi.com",
    },
  };

  const res = await fetch(
    "https://footapi7.p.rapidapi.com/api/tournament/23/season/42415/standings/total",
    options
  );
  const data = await res.json();
  return {
    props: {
      table: data,
    },
  };
};

export default function Standings({ table }) {
  return (
    <div>
      <Head>
        <title>Standings | Premier League</title>
        <meta
          name="description"
          content="Premier League Live Scores, Results and Standings"
        />

        <link rel="icon" href="/images/favicon.ico" />
      </Head>

      <div className="flex justify-between items-center py-4 px-6 bg-white shadow-md rounded-md mb-4">
        <div className="w-1/12"></div>
        <div className="w-4/12">
          <p className="text-gray-700 font-medium">Team</p>
        </div>
        <div className="w-1/12">
          <p className="text-gray-700 font-medium">P</p>
        </div>
        <div className="w-1/12">
          <p className="text-gray-700 font-medium">W</p>
        </div>
        <div className="w-1/12">
          <p className="text-gray-700 font-medium">D</p>
        </div>
        <div className="w-1/12">
          <p className="text-gray-700 font-medium">L</p>
        </div>
        <div className="w-2/12">
          <p className="text-gray-700 font-medium">Points</p>
        </div>
      </div>

      {table.standings[0].rows.map(
        (standing: {
          id: Key | null | undefined;
          position:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
          team: {
            name:
              | string
              | number
              | boolean
              | ReactElement<any, string | JSXElementConstructor<any>>
              | ReactFragment
              | ReactPortal
              | null
              | undefined;
          };
          matches:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
          wins:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
          draws:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
          losses:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
          points:
            | string
            | number
            | boolean
            | ReactElement<any, string | JSXElementConstructor<any>>
            | ReactFragment
            | ReactPortal
            | null
            | undefined;
        }) => (
          <div
            key={standing.id}
            className="flex justify-between items-center py-4 px-6 bg-white shadow-md rounded-md mb-4"
          >
            <div className="w-1/12">
              <p className="text-gray-700 font-medium">{standing.position}</p>
            </div>
            <div className="w-4/12">
              <p className="text-gray-700 font-medium">{standing.team.name}</p>
            </div>
            <div className="w-1/12">
              <p className="text-gray-700 font-medium">{standing.matches}</p>
            </div>
            <div className="w-1/12">
              <p className="text-gray-700 font-medium">{standing.wins}</p>
            </div>
            <div className="w-1/12">
              <p className="text-gray-700 font-medium">{standing.draws}</p>
            </div>
            <div className="w-1/12">
              <p className="text-gray-700 font-medium">{standing.losses}</p>
            </div>
            <div className="w-2/12">
              <p className="text-gray-700 font-medium">{standing.points}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
