import Image from "next/image";
import React from "react";
import Link from "next/link";

function NavBar() {
  return (
    <div className="flex flex-row justify-center">
      <nav className="font-sans flex py-2 px-6 bg-white bg-opacity-30 backdrop-blur-sm rounded-sm shadow sm:items-baseline w-5/6">
        <div className="pt-3 grid grid-cols-3 font-semibold w-full text-center">
          <div className="h-10 pt-3 ml-auto flex col-auto w-screen max-[640px]:w-2vw] whitespace-nowrap font-semibold">
            <div className="flex justify-center w-[80.5vw] pl-[5vw]">
              <div className="space-x-7 -m-[1vh] w-full align-center">
                <Link href={"/about"}>About{"  "}</Link>
                <div className="pr-5"></div>
                <Link href={"/projects"}>Fixtures</Link>
              </div>
              <div className="-m-[1vh] flex flex-row flex-grow"></div>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default NavBar;
