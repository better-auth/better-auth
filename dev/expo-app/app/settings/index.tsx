import * as React from 'react';
import {View} from 'react-native';
import {Text} from '@/components/ui';
import List, {ListHeader} from "@/components/ui/list";
import ListItem from "@/components/ui/list-item";
import {Muted} from "@/components/ui/typography";
import {Plus, PlusCircle} from "@/components/Icons";


export default function Settings() {
  return (
    <View className="flex-1 w-full px-6 pt-4 bg-muted gap-y-6">

      <List>
        <ListHeader>
          <Muted>Habbits</Muted>
        </ListHeader>

        <ListItem
          itemLeft={(props) => <PlusCircle {...props} />} // props adds size and color attributes
          label="Exercise daily"

        // href="/general" // automatically adds a ">" icon
        />
        <ListItem
          itemLeft={(props) => <PlusCircle {...props} />} // props adds size and color attributes
          label="Read books"
        // variant="link"
        />
        <ListItem
          itemLeft={(props) => <PlusCircle {...props} />} // props adds size and color attributes
          label="Practice mindfulness"
        // variant='destructive'

        />
      </List>
    </View>
  );
}
