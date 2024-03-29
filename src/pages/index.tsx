import Image from "next/image";
import { Inter } from "next/font/google";
import NavBar from "../../components/navbar";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main
      className={`flex min-h-screen w-[100%] flex-col items-center justify-between p-2 ${inter.className}`}
    >
      {" "}
      <div className="z-10 flex space-x-5 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex text-[#008fd7]">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-zinc-200 shadow-md bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Hello,&nbsp;
          <code className="font-mono"> stranger!</code>
          {/* add typewriter effect here */}
        </p>
        <div className="bottom-0 right-5 flex fixed h-48 items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <div className="flex flex-row justify-center align-middle">
            <nav className="font-sans flex py-2 px-6 bg-zinc-100/30 rounded-md bg-opacity-40 dark:bg-zinc-800/30 backdrop-blur-sm shadow sm:items-baseline w-full">
              <div className="pt-10 -m-7 flex-row justify-center align-center grid grid-cols-2 font-semibold w-full text-center ">
                {" "}
                <Link href={"/standings"}>League Table</Link>
                {"  "}
                <Link href={"/results"}>Match Results</Link>{" "}
                <div className="h-10 pt-3 ml-auto flex col-auto w-screen max-[640px]:w-2vw] whitespace-nowrap font-semibold">
                  <div className="flex justify-center w-[80.5vw] pl-[5vw]">
                    <div className="-m-[1vh] w-full text-center"></div>
                  </div>
                </div>
              </div>
            </nav>
          </div>
        </div>{" "}
        <div className="flex flex-row justify-items-end flex-grow align-right pt-5"></div>
        <div className="text-black dark:text-white font-bold pt-5 mr-[50%]">
          {" "}
          By{"  "}
        </div>
        <a
          className="pointer-events-none flexplace-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
          href="https://www.salahs.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            sizes="(max-width: 768px) 10vw, (max-width: 700px) 21vw, 13vw"
            src="/salahav.png"
            alt="Salah avatar image of me"
            className="w-full relative pt-[80%] pb-5"
            width={182}
            height={194}
            priority
          />
        </a>
      </div>
      <div className="relative -mt-[50vh] flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[24px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700/10 after:dark:from-sky-900 after:dark:via-[#0141ff]/40 before:lg:h-[360px]"></div>{" "}
      <p className="-mb-[43rem] text-lg subpixel-antialiased font-semibold">
        Welcome and enjoy checking the latests scores and table standings for
        your favorite Italian club in Serie A.
      </p>
      <Image
        className=""
        src="/seriea.png"
        alt="Italian Serie A Logo"
        width={510}
        height={437}
        priority
      />
      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left">
        <a
          href="/results"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        ></a>
      </div>
    </main>
  );
}
