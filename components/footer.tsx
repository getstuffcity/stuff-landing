export default function Footer() {
  return (<footer className="w-full py-4 bg-stone-100 dark:bg-stone-800 text-center z-10">
    <div className="text-md md:text-lg font-newsreader font-light">

      <a href="mailto:hello@getstuff.city" target="_blank" className="px-2 hover:underline">Say hi at hello@getstuff.city</a>

      <a href="https://www.tiktok.com/@getstuff.city" target="_blank" className="px-2 hover:underline">TikTok</a>

      {/* <a href="https://www.linkedin.com/" target="_blank" className="px-2">LinkedIn</a>  */}

      <a href="https://www.instagram.com/getstuff.city" target="_blank" className="px-2 hover:underline">Instagram</a>

    </div>
  </footer>)
}