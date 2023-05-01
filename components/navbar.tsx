import Image from "next/image";
import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export default function NavBar() {
  return (
    <div className="z-10 flex space-x-5 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex text-red-400 ">
      <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
        Under&nbsp;
        <code className="font-mono">construction.</code>
      </p>
      <div className="bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
        <div className="flex flex-row justify-center align-middle">
          <nav className="font-sans flex py-2 px-6 bg-white bg-opacity-30 backdrop-blur-sm rounded-sm shadow sm:items-baseline w-5/6">
            <div className="pt-3 grid grid-cols-3 font-semibold w-full text-center">
              <div className="h-10 pt-3 ml-auto flex col-auto w-screen max-[640px]:w-2vw] whitespace-nowrap font-semibold">
                <div className="flex justify-center w-[80.5vw] pl-[5vw]">
                  <div className="-m-[1vh] w-full text-center">
                    <Link href={"/about"}>About Me</Link>
                    {"  "}
                    <Link href={"/projects"}>Projects</Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </div>{" "}
      <div className="flex flex-row justify-center flex-grow align-center"></div>
      <div className="pr- pt-14"> By{"  "}</div>
      <a
        className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
        href="https://www.salahs.org/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image
          src="/salahav.png"
          alt="Vercel Logo"
          className="dark:invert"
          width={82}
          height={94}
          priority
        />
      </a>
    </div>
  );
}
