import { ConfidentialSurveyDemo } from "@/components/ConfidentialSurveyDemo";


export default function Home() {
  return (
    <main className="">
      <div className="flex flex-col gap-8 items-center sm:items-start w-full px-3 md:px-0">
        <ConfidentialSurveyDemo />
      </div>
    </main>
  );
}
